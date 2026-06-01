import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { 
  Settings as SettingsIcon, 
  User, 
  Globe,
  Brain,
  Zap,
  Instagram,
  BarChart,
  Bell,
  Shield,
  Palette,
  CreditCard,
  AlertTriangle,
  Search,
  Menu,
  X
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  AccountSettings, 
  WorkspaceSettings,
  AppearanceSettings,
  AISettings,
  SecurityPrivacySettings,
  NotificationSettings,
  DangerZoneSettings,
  AutomationSettings,
  SocialAccountsSettings,
  AnalyticsSettings,
  BillingSettings
} from '@/components/settings/SettingsTabs'


export default function Settings() {
  return (
    <>
      <SEO 
        {...seoConfig.settings}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <SettingsContent />
    </>
  )
}

function SettingsContent() {
  const [location] = useLocation()
  const [activeTab, setActiveTab] = useState(() => {
    // Read ?tab= from URL on first render
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    // Map URL aliases to internal tab IDs
    if (tab === 'social-accounts' || tab === 'social') return 'social'
    if (tab && ['account','workspace','appearance','billing','ai','automation','analytics','notifications','security','danger'].includes(tab)) return tab
    return 'account'
  })
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const categories = [
    {
      group: 'General',
      items: [
        { id: 'account', label: 'Account Profile', icon: User },
        { id: 'workspace', label: 'Workspaces', icon: Globe },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
      ]
    },
    {
      group: 'Features',
      items: [
        { id: 'ai', label: 'AI Configuration', icon: Brain },
        { id: 'automation', label: 'Automations', icon: Zap },
        { id: 'social', label: 'Social Accounts', icon: Instagram },
        { id: 'analytics', label: 'Analytics', icon: BarChart },
      ]
    },
    {
      group: 'Preferences',
      items: [
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'security', label: 'Security & Privacy', icon: Shield },
      ]
    },
    {
      group: 'Advanced',
      items: [
        { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, danger: true },
      ]
    }
  ]

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'account': return <AccountSettings />
      case 'workspace': return <WorkspaceSettings />
      case 'appearance': return <AppearanceSettings />
      case 'billing': return <BillingSettings />
      case 'ai': return <AISettings />
      case 'automation': return <AutomationSettings />
      case 'social': return <SocialAccountsSettings />
      case 'analytics': return <AnalyticsSettings />
      case 'notifications': return <NotificationSettings />
      case 'security': return <SecurityPrivacySettings />
      case 'danger': return <DangerZoneSettings />
      default: 
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
            <SettingsIcon className="w-16 h-16 text-gray-300 dark:text-gray-700 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coming Soon</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
              This settings category is currently under development. It will be available in a future update.
            </p>
          </div>
        )
    }
  }


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-xl shadow-sm shadow-blue-500/20 hidden sm:block">
              <SettingsIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage your enterprise workspace and preferences
              </p>
            </div>
          </div>
          
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

          {/* Sticky Sidebar */}
          <div className={`lg:col-span-3 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 sticky top-24">
              
              {categories.map((group, groupIdx) => (
                <div key={group.group} className={`${groupIdx > 0 ? 'mt-6' : ''}`}>
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-3">
                    {group.group}
                  </h4>
                  <nav className="space-y-1">
                    {group.items.map((tab) => {
                      const Icon = tab.icon
                      const isActive = activeTab === tab.id
                      const isDanger = tab.danger
                      
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTab(tab.id)
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
                          {tab.label}
                        </button>
                      )
                    })}
                  </nav>
                </div>
              ))}
              
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-9">
            {renderActiveTab()}
          </div>
          
        </div>
      </div>
    </div>
  )
}
