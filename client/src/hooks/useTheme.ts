import { useState, useEffect } from 'react'
import { Theme, getStoredTheme, setStoredTheme, applyTheme, getSystemTheme } from '@/lib/theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Listen for theme changes from other components
    const handleThemeChange = (event: CustomEvent) => {
      const newTheme = event.detail.theme
      if (newTheme !== theme) {
        setTheme(newTheme)
      }
    }
    
    window.addEventListener('theme-changed', handleThemeChange as EventListener)
    
    return () => {
      window.removeEventListener('theme-changed', handleThemeChange as EventListener)
    }
  }, [theme])

  const toggleTheme = () => {
    const themeCycle = ['light', 'dark', 'dark-blue', 'dark-black', 'dark-gray', 'system']
    const currentIndex = themeCycle.indexOf(theme)
    const newTheme = themeCycle[(currentIndex + 1) % themeCycle.length] as Theme
    setTheme(newTheme)
    setStoredTheme(newTheme)
    applyTheme(newTheme)
  }

  const setThemeDirect = (newTheme: Theme) => {
    setTheme(newTheme)
    setStoredTheme(newTheme)
    applyTheme(newTheme)
  }

  const currentTheme = theme === 'system' ? getSystemTheme() : theme

  return {
    theme,
    setTheme: setThemeDirect,
    toggleTheme,
    currentTheme,
    mounted
  }
}
