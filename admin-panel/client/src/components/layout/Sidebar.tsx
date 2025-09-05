import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  BookOpen,
  Grid3X3,
  GraduationCap,
  Clock
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

// Main navigation items (top level)
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
  },
  {
    name: 'Courses',
    href: '/courses',
    icon: BookOpen
  },
  {
    name: 'Modules',
    href: '/modules',
    icon: Grid3X3
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

  const hasPermission = (permission?: string) => {
    if (!permission) return true
    return admin?.permissions.includes(permission) || false
  }

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Overview']))

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
      case 'success': return 'bg-green-100 text-green-800'
      case 'warning': return 'bg-yellow-100 text-yellow-800'
      case 'error': return 'bg-red-100 text-red-800'
      case 'info': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          'fixed left-0 top-0 z-50 h-screen w-20 lg:w-64 bg-gradient-to-b from-blue-900 to-blue-800 transform transition-all duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-center lg:justify-between px-4 lg:px-6">
            <div className="flex items-center">
              <div className="bg-white p-2 rounded-xl shadow-lg">
                <GraduationCap className="h-6 w-6 text-blue-900" />
              </div>
              <div className="ml-3 hidden lg:block">
                <h1 className="text-lg font-bold text-white">VeeFore</h1>
                <p className="text-xs text-blue-200">Admin Panel</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-md text-white hover:bg-blue-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Main Navigation Icons */}
          <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto">
            {/* Main navigation items */}
            <div className="space-y-2">
              {mainNavItems.map((item) => {
                const location = useLocation();
                const isActive = location.pathname === item.href;
                
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center justify-center lg:justify-start px-3 py-3 text-white rounded-xl transition-all duration-200 group relative',
                        isActive
                          ? 'bg-blue-600 shadow-lg'
                          : 'hover:bg-blue-700'
                      )
                    }
                    onClick={onClose}
                    title={item.name}
                  >
                    <item.icon className="h-6 w-6 flex-shrink-0" />
                    <span className="ml-3 hidden lg:block font-medium">{item.name}</span>
                    {isActive && (
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-white rounded-l-full"></div>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-blue-700 my-4"></div>

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
                      className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-blue-200 uppercase tracking-wider hover:text-white transition-colors hidden lg:flex"
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
                        {filteredItems.map((item) => (
                          <NavLink
                            key={item.name}
                            to={item.href}
                            className={({ isActive }) =>
                              clsx(
                                'flex items-center justify-center lg:justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group',
                                isActive
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-blue-200 hover:bg-blue-700 hover:text-white'
                              )
                            }
                            onClick={onClose}
                            title={item.name}
                          >
                            <div className="flex items-center space-x-3">
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span className="hidden lg:block">{item.name}</span>
                            </div>
                            {item.badge && (
                              <span className={clsx(
                                'px-2 py-1 text-xs font-medium rounded-full hidden lg:block',
                                getBadgeColor(item.badgeColor)
                              )}>
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-blue-700 p-4 bg-blue-800">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white text-sm font-medium">
                  {admin?.firstName?.[0] || 'A'}{admin?.lastName?.[0] || ''}
                </span>
              </div>
              <div className="flex-1 min-w-0 hidden lg:block">
                <p className="text-sm font-medium text-white truncate">
                  {admin?.firstName} {admin?.lastName}
                </p>
                <p className="text-xs text-blue-200 truncate">
                  {admin?.role} • Level {admin?.level}
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={logout}
                className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm text-blue-200 hover:text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:block">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
