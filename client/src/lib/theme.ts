export type Theme = 'light' | 'dark' | 'dark-blue' | 'dark-black' | 'dark-gray' | 'system'

export type DarkThemeVariant = 'dark' | 'dark-blue' | 'dark-black' | 'dark-gray'

export interface ThemeConfig {
  name: string
  description: string
  colors: {
    background: string
    backgroundSecondary: string
    foreground: string
    card: string
    cardForeground: string
    border: string
    input: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
  }
}

export const THEME_CONFIGS: Record<Theme, ThemeConfig> = {
  light: {
    name: 'Light',
    description: 'Clean and bright interface',
    colors: {
      background: '#ffffff',
      backgroundSecondary: '#f8fafc',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      border: '#e2e8f0',
      input: '#e2e8f0',
      primary: '#3b82f6',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      muted: '#f1f5f9',
      mutedForeground: '#64748b',
      accent: '#f1f5f9',
      accentForeground: '#0f172a'
    }
  },
  dark: {
    name: 'Dark Blue',
    description: 'Classic dark theme with blue accents',
    colors: {
      background: '#0f172a',
      backgroundSecondary: '#1e293b',
      foreground: '#f8fafc',
      card: '#1e293b',
      cardForeground: '#f8fafc',
      border: '#334155',
      input: '#334155',
      primary: '#3b82f6',
      primaryForeground: '#ffffff',
      secondary: '#334155',
      secondaryForeground: '#f8fafc',
      muted: '#334155',
      mutedForeground: '#94a3b8',
      accent: '#334155',
      accentForeground: '#f8fafc'
    }
  },
  'dark-blue': {
    name: 'Deep Blue',
    description: 'Rich blue-tinted dark theme',
    colors: {
      background: '#0c1220',
      backgroundSecondary: '#1a2332',
      foreground: '#e2e8f0',
      card: '#1a2332',
      cardForeground: '#e2e8f0',
      border: '#2d3748',
      input: '#2d3748',
      primary: '#2563eb',
      primaryForeground: '#ffffff',
      secondary: '#2d3748',
      secondaryForeground: '#e2e8f0',
      muted: '#2d3748',
      mutedForeground: '#a0aec0',
      accent: '#2d3748',
      accentForeground: '#e2e8f0'
    }
  },
  'dark-black': {
    name: 'Pure Black',
    description: 'True black theme for OLED displays',
    colors: {
      background: '#000000',
      backgroundSecondary: '#111111',
      foreground: '#ffffff',
      card: '#111111',
      cardForeground: '#ffffff',
      border: '#333333',
      input: '#333333',
      primary: '#ffffff',
      primaryForeground: '#000000',
      secondary: '#333333',
      secondaryForeground: '#ffffff',
      muted: '#333333',
      mutedForeground: '#888888',
      accent: '#333333',
      accentForeground: '#ffffff'
    }
  },
  'dark-gray': {
    name: 'Warm Gray',
    description: 'Soft gray dark theme',
    colors: {
      background: '#1a1a1a',
      backgroundSecondary: '#2a2a2a',
      foreground: '#e5e5e5',
      card: '#2a2a2a',
      cardForeground: '#e5e5e5',
      border: '#404040',
      input: '#404040',
      primary: '#6b7280',
      primaryForeground: '#ffffff',
      secondary: '#404040',
      secondaryForeground: '#e5e5e5',
      muted: '#404040',
      mutedForeground: '#9ca3af',
      accent: '#404040',
      accentForeground: '#e5e5e5'
    }
  },
  system: {
    name: 'System',
    description: 'Follows your system preference',
    colors: {
      background: '#ffffff',
      backgroundSecondary: '#f8fafc',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      border: '#e2e8f0',
      input: '#e2e8f0',
      primary: '#3b82f6',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      muted: '#f1f5f9',
      mutedForeground: '#64748b',
      accent: '#f1f5f9',
      accentForeground: '#0f172a'
    }
  }
}

export function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem('theme') as Theme) || 'system'
}

export function setStoredTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  localStorage.setItem('theme', theme)
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const actualTheme = theme === 'system' ? getSystemTheme() : theme
  
  // Remove all theme classes
  root.classList.remove('light', 'dark', 'dark-blue', 'dark-black', 'dark-gray')
  
  // Add the new theme class
  root.classList.add(actualTheme)
  
  // For dark themes, also add the 'dark' class so Tailwind's dark: classes work
  if (actualTheme !== 'light') {
    root.classList.add('dark')
  }
  
  // Also set the data-theme attribute for better compatibility
  root.setAttribute('data-theme', actualTheme)
  
  // Apply CSS custom properties for the theme
  const themeConfig = THEME_CONFIGS[actualTheme]
  if (themeConfig) {
    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value)
    })
  }
  
  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    const bgColor = themeConfig?.colors.background || '#ffffff'
    metaThemeColor.setAttribute('content', bgColor)
  }
  
  // Force a re-render by dispatching a custom event
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: actualTheme } }))
}

export function initializeTheme() {
  const theme = getStoredTheme()
  applyTheme(theme)
  
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system')
    }
  })
}
