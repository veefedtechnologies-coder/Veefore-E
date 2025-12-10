import { useState, useEffect } from 'react'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { 
  Settings as SettingsIcon, 
  Palette, 
  Bell, 
  Shield, 
  User, 
  Globe,
  Moon,
  Sun,
  Sparkles
} from 'lucide-react'
import { ThemeSelector } from '@/components/ui/theme-selector'
import { useTheme } from '@/hooks/useTheme'
import { THEME_CONFIGS } from '@/lib/theme'
import { Skeleton, SkeletonSettingsSection } from '@/components/ui/skeleton'

function SkeletonSettingsNav() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <nav className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </nav>
    </div>
  )
}

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
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState('appearance')
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'account', label: 'Account', icon: User },
    { id: 'general', label: 'General', icon: Globe }
  ]

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1">
              <SkeletonSettingsNav />
            </div>
            <div className="lg:col-span-3">
              <SkeletonSettingsSection rows={5} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
              <SettingsIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Customize your experience and manage your preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                        activeTab === tab.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-700">
              {activeTab === 'appearance' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Appearance
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Customize the look and feel of your interface
                    </p>
                  </div>

                  {/* Theme Selection */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        Choose Theme
                      </h3>
                      <ThemeSelector variant="grid" />
                    </div>

                    {/* Current Theme Info */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-blue-500" />
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                          Current Theme
                        </h4>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
                          <div 
                            className="w-full h-full"
                            style={{ 
                              background: `linear-gradient(135deg, ${THEME_CONFIGS[theme].colors.background} 0%, ${THEME_CONFIGS[theme].colors.backgroundSecondary} 100%)` 
                            }}
                          />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {THEME_CONFIGS[theme].name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {THEME_CONFIGS[theme].description}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Theme Features */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <Sun className="w-5 h-5 text-amber-500" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            Light Theme
                          </h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Clean and bright interface perfect for daytime use
                        </p>
                      </div>

                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <Moon className="w-5 h-5 text-blue-400" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            Dark Themes
                          </h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Multiple dark color schemes for different preferences
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Notifications
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage your notification preferences
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        Email Notifications
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              Automation Updates
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              Get notified when your automations complete
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Privacy & Security
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage your privacy and security settings
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Data & Privacy
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Your data is encrypted and secure. We never share your personal information with third parties.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'account' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      Account Settings
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage your account information
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Profile Information
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Update your profile information and preferences.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'general' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                      General Settings
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Configure general application settings
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Language & Region
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Set your preferred language and region settings.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
