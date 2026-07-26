import React from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface ThemeToggleProps {
  className?: string
  variant?: 'default' | 'compact'
}

export function ThemeToggle({ className, variant = 'default' }: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme()

  if (!mounted) {
    return (
      <Skeleton variant="rectangle" className={cn("w-12 h-12 rounded-xl", className)} />
    )
  }

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="w-5 h-5 text-amber-500" />
      case 'dark':
        return <Moon className="w-5 h-5 text-blue-400" />
      case 'system':
        return <Monitor className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      default:
        return <Sun className="w-5 h-5 text-amber-500" />
    }
  }

  const getTooltip = () => {
    switch (theme) {
      case 'light':
        return 'Switch to dark mode'
      case 'dark':
        return 'Switch to system theme'
      case 'system':
        return 'Switch to light mode'
      default:
        return 'Toggle theme'
    }
  }

  const handleToggle = () => {
    toggleTheme()
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleToggle}
        className={cn(
          "relative w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300",
          "flex items-center justify-center shadow-sm hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
          className
        )}
        title={getTooltip()}
      >
        <div className="transition-transform duration-300 hover:scale-110">
          {getIcon()}
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "relative w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
        "hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300",
        "flex items-center justify-center shadow-sm hover:shadow-md",
        "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
        "group",
        className
      )}
      title={getTooltip()}
    >
      <div className="transition-all duration-300 group-hover:scale-110">
        {getIcon()}
      </div>
      
      {/* Subtle glow effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-400/10 to-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </button>
  )
}
