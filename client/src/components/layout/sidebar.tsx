import React, { useState, useEffect } from 'react'
import { Home, Calendar, BarChart3, MessageSquare, Settings, Globe, LogOut, Users, Link, Plus, Zap, Video, Shield, Activity, CreditCard, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreateDropdown } from './create-dropdown'
import { logout } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { useLocation } from 'wouter'
import { useUser } from '@/hooks/useUser'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'
import { ActiveWorkspaceProvider } from '@/contexts/ActiveWorkspaceContext'

// Grouped sidebar items for better organization
const sidebarGroups = [
  {
    title: "Core",
    items: [
      { icon: Home, label: 'Home', key: 'home', url: '/' },
      { icon: Calendar, label: 'Plan', key: 'plan', url: '/plan' },
      { icon: Plus, label: 'Create', key: 'create', isCreateButton: true },
    ]
  },
  {
    title: "Communication",
    items: [
      ...(import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true' ? [] : [{ icon: MessageSquare, label: 'Inbox 2.0', key: 'inbox', url: '/inbox' }]),
    ]
  },
  {
    title: "Analytics & Automation",
    items: [
      { icon: BarChart3, label: 'Analytics', key: 'analytics', url: '/analytics' },
      ...(import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true' ? [] : [{ icon: Zap, label: 'Automation', key: 'automation', url: '/automation' }]),
      { icon: Activity, label: 'Listening', key: 'social-listening', url: '/social-listening' },
    ]
  },
  {
    title: "Management",
    items: [
      { icon: Coins, label: 'Credits', key: 'credits', url: '/credits' },
      { icon: Shield, label: 'Security Health', key: 'encryption-health', url: '/encryption-health' },
      { icon: Settings, label: 'Test Fixtures', key: 'test-fixtures', url: '/test-fixtures' },
    ]
  }
]

interface SidebarProps {
  className?: string
  isCreateDropdownOpen?: boolean
  setIsCreateDropdownOpen?: (open: boolean) => void
}

export function Sidebar({ className, isCreateDropdownOpen, setIsCreateDropdownOpen }: SidebarProps) {
  const [localDropdownOpen, setLocalDropdownOpen] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [location, setLocation] = useLocation()
  const [prevActiveView, setPrevActiveView] = useState('')
  const dropdownOpen = isCreateDropdownOpen ?? localDropdownOpen
  const setDropdownOpen = setIsCreateDropdownOpen ?? setLocalDropdownOpen
  const { toast } = useToast()
  const { userData } = useUser()

  // Convert URL to activeView for backwards compatibility
  const getActiveViewFromLocation = (loc: string) => {
    if (loc === '/') return 'home'
    if (loc === '/plan') return 'plan'
    if (loc === '/create') return 'create'
    if (loc === '/video-generator') return 'video-generator'
    if (loc === '/veegpt') return 'veegpt'
    if (loc === '/inbox') return 'inbox'
    if (loc === '/analytics' || loc.startsWith('/analytics/')) return 'analytics'
    if (loc === '/automation') return 'automation'
    if (loc === '/social-listening') return 'social-listening'
    if (loc === '/settings') return 'settings'
    if (loc === '/admin') return 'admin'
    if (loc === '/landing') return 'landing'
    if (loc === '/test-fixtures') return 'test-fixtures'
    if (loc === '/encryption-health') return 'encryption-health'
    if (loc === '/credits') return 'credits'
    return 'home'
  }

  const activeView = getActiveViewFromLocation(location)

  // Handle smooth exit animation ONLY when leaving VeeGPT
  useEffect(() => {
    console.log('Exit Effect - prevActiveView:', prevActiveView, 'activeView:', activeView, 'isExiting:', isExiting)
    
    // Only trigger exit animation when coming FROM veegpt TO another page
    if (prevActiveView === 'veegpt' && activeView !== 'veegpt') {
      console.log('🎯 TRIGGERING EXIT ANIMATION - Leaving VeeGPT from', prevActiveView, 'to', activeView)
      setIsExiting(true)
      // Reset exit state and update prevActiveView after animation completes
      const timer = setTimeout(() => {
        console.log('🔄 EXIT ANIMATION COMPLETE - Resetting state')
        setIsExiting(false)
        setPrevActiveView(activeView) // Update to current view AFTER animation
      }, 1200) // Match the exit animation duration
      return () => clearTimeout(timer)
    } else {
      // Update previous view immediately for non-VeeGPT transitions
      setPrevActiveView(activeView)
    }
  }, [activeView, prevActiveView])

  const handleCreateClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('Create button clicked, current state:', dropdownOpen)
    setDropdownOpen(!dropdownOpen)
    console.log('Create button clicked, new state will be:', !dropdownOpen)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [dropdownOpen])

  const handleCreateOptionSelect = (option: string) => {
    setDropdownOpen(false)
    console.log('Selected create option:', option)
    if (option === 'post') setLocation('/posts')
    if (option === 'automation') setLocation('/automation')
    if (option === 'video') setLocation('/video-generator')
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Render navigation item
  const renderNavItem = (item: any) => (
    <div
      key={item.label}
      data-testid={item.isCreateButton ? "create-dropdown-trigger" : undefined}
      data-nav={item.key}
      onClick={(e) => {
        if (item.isCreateButton) {
          handleCreateClick(e)
        } else if (item.url) {
          setLocation(item.url)
        }
      }}
      className={cn(
        "flex flex-col items-center cursor-pointer transition-all duration-300 relative group py-2",
        activeView === item.key 
          ? "text-blue-600 dark:text-blue-400" 
          : "text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
      )}
    >
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-1",
        activeView === item.key 
          ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg border border-blue-200/50 dark:border-blue-600/50" 
          : "hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 hover:shadow-md"
      )}>
        <item.icon className={cn(
          "w-5 h-5 transition-all duration-300",
          activeView === item.key ? "scale-110" : "group-hover:scale-105"
        )} />
        {item.isCreateButton && dropdownOpen && (
          // skeleton-guard-allow: status-dot — decorative create-button notification accent dot, not a loading placeholder
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-orange-500 to-red-600 rounded-full animate-pulse"></div>
        )}
      </div>
      
      {/* Icon Label */}
      <span className={cn(
        "text-xs font-medium transition-all duration-300",
        activeView === item.key 
          ? "text-blue-600 dark:text-blue-400 font-semibold !important" 
          : "text-gray-600 dark:text-gray-300"
      )}
      style={activeView === item.key ? { color: 'rgb(37 99 235)' } : undefined}>
        {item.label}
      </span>
      
    </div>
  )

  return (
    <ActiveWorkspaceProvider>
    <div className={cn("w-24 bg-white dark:bg-slate-800 flex flex-col h-full min-h-full overflow-y-auto [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 relative transition-colors duration-300", className)}>
      {/* WorkspaceSwitcher — only visible when user has more than one workspace */}
      <WorkspaceSwitcher />

      {/* VeeGPT Logo Section */}
      <div className="flex flex-col items-center py-6 bg-white dark:bg-slate-800">
        <div 
          className={cn(
            "flex flex-col items-center cursor-pointer transition-all duration-500 group py-2 mb-4 transform-gpu veegpt-nav-item",
            activeView === 'veegpt' 
              ? "text-blue-600 dark:text-blue-400" 
              : "text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          )}
          data-nav="veegpt"
          onClick={() => setLocation('/veegpt')}
        >
          <div className={cn(
            "w-16 h-16 bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 rounded-2xl flex items-center justify-center transition-all duration-500 mb-2 shadow-lg border border-gray-200/50 dark:border-gray-600/50 backdrop-blur-sm relative overflow-hidden",
            activeView === 'veegpt' 
              ? "shadow-2xl border-2 border-blue-300 scale-110 bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-blue-900/20 dark:via-gray-800 dark:to-blue-800/20 animate-morph-active" 
              : isExiting
              ? "animate-veegpt-exit shadow-lg border border-gray-200/50 dark:border-gray-600/50 bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900"
              : "hover:shadow-2xl hover:scale-105 hover:bg-gradient-to-br hover:from-blue-50 hover:via-white hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:via-gray-800 dark:hover:to-purple-900/20 hover-morphing"
          )}>
            {/* Energy waves - show during active or when exiting */}
            {(activeView === 'veegpt' || isExiting) && (
              <>
                <div className={cn(
                  "absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-blue-400/20 to-transparent",
                  isExiting ? "animate-energy-wave-exit-1" : "animate-energy-wave-1"
                )}></div>
                <div className={cn(
                  "absolute inset-0 rounded-2xl bg-gradient-to-b from-transparent via-purple-400/15 to-transparent",
                  isExiting ? "animate-energy-wave-exit-2" : "animate-energy-wave-2"
                )}></div>
                <div className={cn(
                  "absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-indigo-400/10 to-transparent",
                  isExiting ? "animate-energy-wave-exit-3" : "animate-energy-wave-3"
                )}></div>
              </>
            )}
            
            {/* Geometric particles */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute w-1 h-1 bg-blue-500 animate-geometric-float-1 opacity-60" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></div>
              <div className="absolute w-1 h-1 bg-purple-500 animate-geometric-float-2 opacity-50 rounded-full"></div>
              <div className="absolute w-0.5 h-3 bg-indigo-500 animate-geometric-float-3 opacity-70"></div>
              <div className="absolute w-2 h-0.5 bg-cyan-500 animate-geometric-float-4 opacity-40"></div>
            </div>
            
            {/* VeeFore Logo with morphing effects */}
            <img 
              src="/veefore-logo.png" 
              alt="VeeFore" 
              className={cn(
                "w-10 h-10 transition-all duration-500 filter drop-shadow-lg relative z-10",
                activeView === 'veegpt' 
                  ? "scale-110 brightness-110 drop-shadow-xl animate-logo-morph" 
                  : isExiting
                  ? "animate-logo-exit drop-shadow-lg"
                  : "group-hover:scale-115 group-hover:brightness-110 group-hover:drop-shadow-xl group-hover:animate-logo-hover-morph"
              )}
              style={{
                filter: activeView === 'veegpt' 
                  ? 'drop-shadow(0 0 15px rgba(59, 130, 246, 0.4)) brightness(1.1) hue-rotate(10deg)' 
                  : isExiting
                  ? 'brightness(0.8) hue-rotate(0deg)'
                  : undefined
              }}
            />
          </div>
          
          {/* Glow effect when active - removed for consistency */}
        </div>
      </div>

      {/* Main Navigation Section */}
      <div className="flex-1 flex flex-col justify-center bg-white dark:bg-slate-800">
        <nav className="flex flex-col space-y-4">
          {sidebarGroups.flatMap(group => group.items).map((item) => renderNavItem(item))}
        </nav>
      </div>

      {/* Bottom Section - Settings, Billing and Logout */}
      <div className="flex flex-col space-y-4 py-6 bg-white dark:bg-slate-800">
        {/* Billing */}
        <div 
          className={cn(
            "flex flex-col items-center cursor-pointer transition-all duration-300 relative group py-2",
            location === '/settings/billing'
              ? 'text-blue-600 dark:text-blue-400' 
              : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
          )}
          onClick={() => setLocation('/settings/billing')}
        >
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-1",
            location === '/settings/billing'
              ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg border border-blue-200/50 dark:border-blue-600/50"
              : "hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 hover:shadow-md"
          )}>
            <CreditCard className={cn(
              "w-5 h-5 transition-all duration-300",
              location === '/settings/billing' ? "scale-110" : "group-hover:scale-105"
            )} />
          </div>
          <span className={cn(
            "text-xs font-medium transition-all duration-300",
            location === '/settings/billing'
              ? "text-blue-600 dark:text-blue-400 font-semibold" 
              : "text-gray-600 dark:text-gray-300"
          )}>Billing</span>
          {location === '/settings/billing' && (
            <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
          )}
        </div>

        {/* Settings */}
        <div 
          className={cn(
            "flex flex-col items-center cursor-pointer transition-all duration-300 relative group py-2",
            activeView === 'settings' 
              ? 'text-blue-600 dark:text-blue-400' 
              : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
          )}
          onClick={() => setLocation('/settings')}
        >
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-1",
            activeView === 'settings'
              ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg border border-blue-200/50 dark:border-blue-600/50"
              : "hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 hover:shadow-md"
          )}>
            <Settings className={cn(
              "w-5 h-5 transition-all duration-300",
              activeView === 'settings' ? "scale-110" : "group-hover:scale-105"
            )} />
          </div>
          <span className={cn(
            "text-xs font-medium transition-all duration-300",
            activeView === 'settings' 
              ? "text-blue-600 dark:text-blue-400 font-semibold" 
              : "text-gray-600 dark:text-gray-300"
          )}>Settings</span>
          
          {/* Active indicator */}
          {activeView === 'settings' && (
            <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
          )}
        </div>
        
        {/* Logout */}
        <div 
          className="flex flex-col items-center cursor-pointer transition-all duration-300 relative group py-2 hover:text-red-600 dark:hover:text-red-400"
          onClick={handleLogout}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-red-700 dark:from-red-600 dark:via-red-700 dark:to-red-800 flex items-center justify-center hover:shadow-lg hover:scale-105 transition-all duration-300 mb-1">
            <LogOut className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Logout</span>
        </div>
      </div>
      
      {/* Create Dropdown */}
      <CreateDropdown 
        isOpen={dropdownOpen}
        onClose={() => setDropdownOpen(false)}
        onOptionSelect={handleCreateOptionSelect}
      />
    </div>
    </ActiveWorkspaceProvider>
  )
}
