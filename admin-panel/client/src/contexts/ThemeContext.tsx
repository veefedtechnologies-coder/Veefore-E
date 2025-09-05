import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'auto';
export type ColorScheme = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'gray';

export interface ThemeConfig {
  theme: Theme;
  colorScheme: ColorScheme;
  fontSize: 'sm' | 'md' | 'lg';
  density: 'compact' | 'normal' | 'comfortable';
  animations: boolean;
  reducedMotion: boolean;
}

interface ThemeContextType {
  theme: Theme;
  colorScheme: ColorScheme;
  fontSize: 'sm' | 'md' | 'lg';
  density: 'compact' | 'normal' | 'comfortable';
  animations: boolean;
  reducedMotion: boolean;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  setFontSize: (fontSize: 'sm' | 'md' | 'lg') => void;
  setDensity: (density: 'compact' | 'normal' | 'comfortable') => void;
  setAnimations: (animations: boolean) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  resetTheme: () => void;
}

const defaultTheme: ThemeConfig = {
  theme: 'light',
  colorScheme: 'blue',
  fontSize: 'md',
  density: 'normal',
  animations: true,
  reducedMotion: false
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Partial<ThemeConfig>;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme: initialTheme = {}
}) => {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    ...defaultTheme,
    ...initialTheme
  });

  const [isDark, setIsDark] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('admin-panel-theme');
    if (savedTheme) {
      try {
        const parsed = JSON.parse(savedTheme);
        setThemeConfig(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse saved theme:', error);
      }
    }
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('admin-panel-theme', JSON.stringify(themeConfig));
  }, [themeConfig]);

  // Handle system theme changes
  useEffect(() => {
    if (themeConfig.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };

      setIsDark(mediaQuery.matches);
      mediaQuery.addEventListener('change', handleChange);

      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      setIsDark(themeConfig.theme === 'dark');
    }
  }, [themeConfig.theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Apply theme class
    root.classList.remove('light', 'dark');
    root.classList.add(isDark ? 'dark' : 'light');

    // Apply color scheme
    root.classList.remove('blue', 'green', 'purple', 'red', 'orange', 'gray');
    root.classList.add(themeConfig.colorScheme);

    // Apply font size
    root.classList.remove('text-sm', 'text-md', 'text-lg');
    root.classList.add(`text-${themeConfig.fontSize}`);

    // Apply density
    root.classList.remove('density-compact', 'density-normal', 'density-comfortable');
    root.classList.add(`density-${themeConfig.density}`);

    // Apply animations
    if (!themeConfig.animations || themeConfig.reducedMotion) {
      root.classList.add('no-animations');
    } else {
      root.classList.remove('no-animations');
    }

    // Apply reduced motion
    if (themeConfig.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
  }, [themeConfig, isDark]);

  const setTheme = (theme: Theme) => {
    setThemeConfig(prev => ({ ...prev, theme }));
  };

  const setColorScheme = (colorScheme: ColorScheme) => {
    setThemeConfig(prev => ({ ...prev, colorScheme }));
  };

  const setFontSize = (fontSize: 'sm' | 'md' | 'lg') => {
    setThemeConfig(prev => ({ ...prev, fontSize }));
  };

  const setDensity = (density: 'compact' | 'normal' | 'comfortable') => {
    setThemeConfig(prev => ({ ...prev, density }));
  };

  const setAnimations = (animations: boolean) => {
    setThemeConfig(prev => ({ ...prev, animations }));
  };

  const setReducedMotion = (reducedMotion: boolean) => {
    setThemeConfig(prev => ({ ...prev, reducedMotion }));
  };

  const resetTheme = () => {
    setThemeConfig(defaultTheme);
  };

  const value: ThemeContextType = {
    ...themeConfig,
    isDark,
    setTheme,
    setColorScheme,
    setFontSize,
    setDensity,
    setAnimations,
    setReducedMotion,
    resetTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Theme Toggle Component
export const ThemeToggle: React.FC<{
  className?: string;
}> = ({ className }) => {
  const { theme, setTheme, isDark } = useTheme();

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className={`p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
      title={`Current theme: ${theme}${theme === 'auto' ? ` (${isDark ? 'dark' : 'light'})` : ''}`}
    >
      {theme === 'light' && <SunIcon />}
      {theme === 'dark' && <MoonIcon />}
      {theme === 'auto' && <AutoIcon />}
    </button>
  );
};

// Color Scheme Selector Component
export const ColorSchemeSelector: React.FC<{
  className?: string;
}> = ({ className }) => {
  const { colorScheme, setColorScheme } = useTheme();

  const colorSchemes: Array<{ value: ColorScheme; name: string; color: string }> = [
    { value: 'blue', name: 'Blue', color: 'bg-blue-500' },
    { value: 'green', name: 'Green', color: 'bg-green-500' },
    { value: 'purple', name: 'Purple', color: 'bg-purple-500' },
    { value: 'red', name: 'Red', color: 'bg-red-500' },
    { value: 'orange', name: 'Orange', color: 'bg-orange-500' },
    { value: 'gray', name: 'Gray', color: 'bg-gray-500' }
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Color Scheme
      </label>
      <div className="flex space-x-2">
        {colorSchemes.map(({ value, name, color }) => (
          <button
            key={value}
            onClick={() => setColorScheme(value)}
            className={`w-8 h-8 rounded-full ${color} ${
              colorScheme === value ? 'ring-2 ring-offset-2 ring-blue-500' : ''
            } transition-all`}
            title={name}
          />
        ))}
      </div>
    </div>
  );
};

// Theme Settings Panel Component
export const ThemeSettingsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}> = ({ isOpen, onClose, className }) => {
  const {
    theme,
    colorScheme,
    fontSize,
    density,
    animations,
    reducedMotion,
    setTheme,
    setColorScheme,
    setFontSize,
    setDensity,
    setAnimations,
    setReducedMotion,
    resetTheme
  } = useTheme();

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Theme Settings
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XIcon />
          </button>
        </div>
        
        <div className="p-4 space-y-6 overflow-y-auto h-full pb-20">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Theme
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (System)</option>
            </select>
          </div>

          {/* Color Scheme */}
          <ColorSchemeSelector />

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Font Size
            </label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as 'sm' | 'md' | 'lg')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </div>

          {/* Density */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Density
            </label>
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as 'compact' | 'normal' | 'comfortable')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </div>

          {/* Animations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Animations
              </label>
              <input
                type="checkbox"
                checked={animations}
                onChange={(e) => setAnimations(e.target.checked)}
                className="rounded"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Reduced Motion
              </label>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="rounded"
              />
            </div>
          </div>

          {/* Reset */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={resetTheme}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Icon Components
const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const AutoIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
