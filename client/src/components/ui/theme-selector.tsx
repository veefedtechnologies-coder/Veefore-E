import React, { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { THEME_CONFIGS, Theme, DarkThemeVariant } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { 
  Sun, 
  Moon, 
  Monitor, 
  Palette, 
  Check,
  ChevronDown,
  Sparkles
} from 'lucide-react'

interface ThemeSelectorProps {
  className?: string
  variant?: 'dropdown' | 'grid' | 'compact'
}

export function ThemeSelector({ className, variant = 'dropdown' }: ThemeSelectorProps) {
  const { theme, setTheme, mounted } = useTheme()
  const [isOpen, setIsOpen] = useState(false)

  if (!mounted) {
    return (
      <div className={cn(
        "w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse",
        className
      )} />
    )
  }

  const getThemeIcon = (themeKey: Theme) => {
    switch (themeKey) {
      case 'light':
        return <Sun className="w-4 h-4 text-amber-500" />
      case 'dark':
        return <Moon className="w-4 h-4 text-blue-400" />
      case 'dark-blue':
        return <Moon className="w-4 h-4 text-blue-600" />
      case 'dark-black':
        return <Moon className="w-4 h-4 text-gray-300" />
      case 'dark-gray':
        return <Moon className="w-4 h-4 text-gray-400" />
      case 'system':
        return <Monitor className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      default:
        return <Sun className="w-4 h-4 text-amber-500" />
    }
  }

  const getThemePreview = (themeKey: Theme) => {
    const config = THEME_CONFIGS[themeKey]
    return (
      <div className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
        <div 
          className="w-full h-full"
          style={{ 
            background: `linear-gradient(135deg, ${config.colors.background} 0%, ${config.colors.backgroundSecondary} 100%)` 
          }}
        />
      </div>
    )
  }

  const handleThemeSelect = (newTheme: Theme) => {
    setTheme(newTheme)
    setIsOpen(false)
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300",
          "flex items-center justify-center shadow-sm hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
          className
        )}
        title="Choose theme"
      >
        <div className="transition-transform duration-300 hover:scale-110">
          {getThemeIcon(theme)}
        </div>
      </button>
    )
  }

  if (variant === 'grid') {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Choose Theme</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(THEME_CONFIGS).map(([themeKey, config]) => (
            <button
              key={themeKey}
              onClick={() => handleThemeSelect(themeKey as Theme)}
              className={cn(
                "relative p-4 rounded-xl border-2 transition-all duration-200",
                "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                theme === themeKey 
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
              )}
            >
              <div className="flex items-center gap-3">
                {getThemePreview(themeKey as Theme)}
                <div className="flex-1 text-left">
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {config.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {config.description}
                  </div>
                </div>
                {theme === themeKey && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Default dropdown variant
  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300",
          "flex items-center justify-center shadow-sm hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
          "group"
        )}
        title="Choose theme"
      >
        <div className="transition-all duration-300 group-hover:scale-110">
          {getThemeIcon(theme)}
        </div>
        
        {/* Subtle glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-400/10 to-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-16 z-50 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Choose Theme</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Select your preferred color scheme
              </p>
            </div>
            
            <div className="p-2">
              {Object.entries(THEME_CONFIGS).map(([themeKey, config]) => (
                <button
                  key={themeKey}
                  onClick={() => handleThemeSelect(themeKey as Theme)}
                  className={cn(
                    "w-full p-3 rounded-xl transition-all duration-200",
                    "hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                    theme === themeKey && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {getThemePreview(themeKey as Theme)}
                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {config.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {config.description}
                      </div>
                    </div>
                    {theme === themeKey && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
