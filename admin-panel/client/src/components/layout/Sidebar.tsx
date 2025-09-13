import React, { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  FileText,
  Ticket,
  Tag,
  BarChart3,
  Shield,
  Settings,
  X,
  ChevronDown,
  ChevronRight,
  Users2,
  Brain,
  Activity,
  Bell,
  Search,
  Menu,
  LogOut,
  Webhook,
  Megaphone,
  Home,
  Search as SearchIcon,
  Settings as SettingsIcon,
  GraduationCap,
  Clock,
  Zap,
  Star,
  TrendingUp,
  Database,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  Moon,
  Sun,
  Palette,
  Sparkles,
  Target,
  Crown,
  Award,
  Rocket,
  UserPlus,
  Download
} from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  children?: NavItem[]
  badge?: string
  badgeColor?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

interface NavSection {
  title: string
  items: NavItem[]
}

// Main navigation items (top level) - Only functional routes
const mainNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home
  },
  {
    name: 'Search',
    href: '/search',
    icon: SearchIcon
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: SettingsIcon
  }
]

// Secondary navigation sections
const navigationSections: NavSection[] = [
  {
    title: 'User Management',
    items: [
      {
        name: 'Users',
        href: '/users',
        icon: Users,
        permission: 'users.read',
        badge: '1.2k',
        badgeColor: 'info'
      },
      {
        name: 'Waitlist',
        href: '/waitlist',
        icon: Clock,
        badge: '18',
        badgeColor: 'warning'
      },
      {
        name: 'Admins',
        href: '/admins',
        icon: UserCheck,
        permission: 'admins.read'
      },
      {
        name: 'Admin Management',
        href: '/admin/management',
        icon: Settings,
        permission: 'admins.read.detailed'
      },
      {
        name: 'Teams',
        href: '/teams',
        icon: Users2,
        permission: 'teams.read'
      }
    ]
  },
  {
    title: 'Business',
    items: [
      {
        name: 'Subscriptions',
        href: '/subscriptions',
        icon: FileText,
        permission: 'subscriptions.read',
        badge: '245',
        badgeColor: 'success'
      },
      {
        name: 'Refunds',
        href: '/refunds',
        icon: CreditCard,
        permission: 'refunds.read',
        badge: '12',
        badgeColor: 'warning'
      },
      {
        name: 'Coupons',
        href: '/coupons',
        icon: Tag,
        permission: 'coupons.read'
      }
    ]
  },
  {
    title: 'Support',
    items: [
      {
        name: 'Tickets',
        href: '/tickets',
        icon: Ticket,
        permission: 'tickets.read',
        badge: '8',
        badgeColor: 'error'
      },
      {
        name: 'Maintenance',
        href: '/maintenance',
        icon: Settings,
        permission: 'maintenance.read'
      }
    ]
  },
  {
    title: 'Analytics & Monitoring',
    items: [
      {
        name: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
        permission: 'analytics.read'
      },
      {
        name: 'Performance',
        href: '/performance',
        icon: Activity,
        permission: 'analytics.read'
      },
      {
        name: 'Audit Logs',
        href: '/audit',
        icon: Shield,
        permission: 'audit.read'
      },
      {
        name: 'AI Moderation',
        href: '/ai-moderation',
        icon: Brain,
        permission: 'ai.read'
      }
    ]
  },
  {
    title: 'System',
    items: [
      {
        name: 'Webhooks',
        href: '/webhooks',
        icon: Webhook,
        permission: 'webhooks.read',
        badge: '5',
        badgeColor: 'info'
      },
      {
        name: 'Maintenance Banners',
        href: '/maintenance-banners',
        icon: Megaphone,
        permission: 'banners.read',
        badge: '2',
        badgeColor: 'warning'
      },
      {
        name: 'Sessions',
        href: '/sessions',
        icon: Users,
        permission: 'sessions.read',
        badge: '3',
        badgeColor: 'info'
      },
      {
        name: 'Bulk Operations',
        href: '/bulk-operations',
        icon: Settings,
        permission: 'bulk.read'
      }
    ]
  }
]

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const hasPermission = (permission?: string) => {
    if (!permission) return true
    return admin?.permissions.includes(permission) || false
  }

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['User Management']))
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [showQuickActions, setShowQuickActions] = useState(true)

  const toggleSection = (sectionTitle: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionTitle)) {
      newExpanded.delete(sectionTitle)
    } else {
      newExpanded.add(sectionTitle)
    }
    setExpandedSections(newExpanded)
  }

  const getBadgeColor = (color?: string) => {
    switch (color) {
      case 'success': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      case 'warning': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      case 'error': return 'bg-red-500/20 text-red-400 border border-red-500/30'
      case 'info': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
    }
  }

  // Quick actions for innovation
  const quickActions = [
    { 
      name: 'New User', 
      icon: UserPlus, 
      action: () => {
        navigate('/users')
        onClose()
      }
    },
    { 
      name: 'Bulk Import', 
      icon: Database, 
      action: () => {
        navigate('/bulk-operations')
        onClose()
      }
    },
    { 
      name: 'Export Data', 
      icon: Download, 
      action: () => {
        // You can implement export functionality here
        console.log('Export Data functionality')
      }
    },
    { 
      name: 'System Health', 
      icon: Activity, 
      action: () => {
        navigate('/performance')
        onClose()
      }
    }
  ]

  const handleLogoClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false)
    } else {
      navigate('/dashboard')
      onClose()
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          'fixed left-0 top-0 z-50 h-screen bg-black border-r border-gray-800 transform transition-all duration-300 ease-in-out lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-72',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-800">
            <div className="flex items-center space-x-3">
              <div className="relative group flex items-center justify-center">
                <div className="relative">
                  {/* Logo - hidden on hover when collapsed */}
                  <button 
                    onClick={handleLogoClick}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden transition-opacity duration-200 ${isCollapsed ? 'group-hover:opacity-0' : ''}`}
                  >
                    <img 
                      src="/veefore-logo.png" 
                      alt="VeeFore Logo" 
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        // Fallback to gradient icon if logo fails to load
                        e.currentTarget.style.display = 'none'
                        const nextElement = e.currentTarget.nextElementSibling as HTMLElement
                        if (nextElement) {
                          nextElement.style.display = 'flex'
                        }
                      }}
                    />
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg hidden">
                      <GraduationCap className="h-6 w-6 text-white" />
                    </div>
                  </button>
                  
                  {/* Expand button - shown on hover when collapsed */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsCollapsed(!isCollapsed)
                    }}
                    className={`absolute inset-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-opacity duration-200 bg-transparent hover:bg-transparent text-white ${isCollapsed ? 'opacity-0 group-hover:opacity-100' : 'hidden'}`}
                    title="Expand"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                  
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black"></div>
                </div>
              </div>
              
              {!isCollapsed && (
                <div>
                  <h1 className="text-lg font-bold text-white">VeeFore</h1>
                  <p className="text-xs text-gray-400">Admin Panel</p>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {!isCollapsed && (
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors hidden lg:block"
                  title="Collapse"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          {!isCollapsed && (
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Quick Actions</h3>
                <button
                  onClick={() => setShowQuickActions(!showQuickActions)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
                >
                  {showQuickActions ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {showQuickActions && (
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={action.action}
                      className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <action.icon className="h-4 w-4" />
                      <span>{action.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Main Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto custom-scrollbar">
            {/* Main navigation items */}
            <div className="space-y-1">
              {mainNavItems.map((item) => {
                const isActive = location.pathname === item.href;
                
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center px-3 py-3 text-gray-300 rounded-xl transition-all duration-200 group relative',
                        isActive
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                          : 'hover:bg-gray-800 hover:text-white'
                      )
                    }
                    onClick={onClose}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && (
                      <>
                        <span className="ml-3 font-medium">{item.name}</span>
                        {isActive && (
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-800 my-4"></div>

            {/* Secondary navigation sections */}
            <div className="space-y-1">
              {navigationSections.map((section) => {
                const filteredItems = section.items.filter(item => hasPermission(item.permission))
                if (filteredItems.length === 0) return null

                const isExpanded = expandedSections.has(section.title)

                return (
                  <div key={section.title} className="space-y-1">
                    <button
                      onClick={() => toggleSection(section.title)}
                      className={clsx(
                        'flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white transition-colors',
                        !isCollapsed ? 'flex' : 'hidden'
                      )}
                    >
                      <span>{section.title}</span>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    
                    {isExpanded && (
                      <div className="space-y-1 ml-0 lg:ml-2">
                        {filteredItems.map((item) => {
                          const isActive = location.pathname === item.href;
                          
                          return (
                            <NavLink
                              key={item.name}
                              to={item.href}
                              className={({ isActive }) =>
                                clsx(
                                  'flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group',
                                  isActive
                                    ? 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-white border border-purple-500/30'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                )
                              }
                              onClick={onClose}
                              title={isCollapsed ? item.name : undefined}
                            >
                              <div className="flex items-center space-x-3">
                                <item.icon className="h-4 w-4 flex-shrink-0" />
                                {!isCollapsed && <span>{item.name}</span>}
                              </div>
                              {item.badge && !isCollapsed && (
                                <span className={clsx(
                                  'px-2 py-1 text-xs font-medium rounded-full',
                                  getBadgeColor(item.badgeColor)
                                )}>
                                  {item.badge}
                                </span>
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-800 p-3 bg-gray-900/50">
            <div className="flex items-center space-x-3 mb-2">
              <div className="relative">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white text-xs font-bold">
                    {admin?.firstName?.[0] || 'A'}{admin?.lastName?.[0] || ''}
                  </span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                  <Crown className="h-1.5 w-1.5 text-black" />
                </div>
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {admin?.firstName} {admin?.lastName}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {admin?.role} • Level {admin?.level}
                  </p>
                </div>
              )}
            </div>
            
            <button
              onClick={logout}
              className="w-full flex items-center justify-center space-x-2 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {!isCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
