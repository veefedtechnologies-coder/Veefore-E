/**
 * P6-3: User Experience (UX) Enhancement System
 * 
 * Production-grade UX improvements with navigation optimization,
 * loading states, error handling, and user feedback systems
 */

/**
 * P6-3.1: UX configuration and interfaces
 */
export interface UXConfig {
  enableLoadingStates: boolean;
  enableProgressIndicators: boolean;
  enableErrorBoundaries: boolean;
  enableToastNotifications: boolean;
  enableNavigationFeedback: boolean;
  enablePerformanceHints: boolean;
  autoSaveInterval: number; // milliseconds
  debounceDelay: number; // milliseconds
}

export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
  cancellable?: boolean;
  onCancel?: () => void;
}

export interface ToastConfig {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  actions?: Array<{
    label: string;
    action: () => void;
    style?: 'primary' | 'secondary';
  }>;
}

/**
 * P6-3.2: Default UX configuration
 */
export const DEFAULT_UX_CONFIG: UXConfig = {
  enableLoadingStates: true,
  enableProgressIndicators: true,
  enableErrorBoundaries: true,
  enableToastNotifications: true,
  enableNavigationFeedback: true,
  enablePerformanceHints: true,
  autoSaveInterval: 30000, // 30 seconds
  debounceDelay: 300 // 300ms
};

/**
 * P6-3.3: UX Enhancement Manager
 */
export class UXManager {
  private static instance: UXManager;
  private config: UXConfig = DEFAULT_UX_CONFIG;
  private loadingStates = new Map<string, LoadingState>();
  private toastQueue: ToastConfig[] = [];
  private autoSaveTimers = new Map<string, NodeJS.Timeout>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  static getInstance(): UXManager {
    if (!UXManager.instance) {
      UXManager.instance = new UXManager();
    }
    return UXManager.instance;
  }

  /**
   * P6-3.3a: Initialize UX enhancement system
   */
  initialize(config?: Partial<UXConfig>): void {
    this.config = { ...DEFAULT_UX_CONFIG, ...config };
    
    this.setupErrorBoundaries();
    this.setupNavigationFeedback();
    this.setupPerformanceMonitoring();
    
    console.log('🎨 P6-3: UX enhancement system initialized');
  }

  /**
   * P6-3.3b: Setup global error boundaries
   */
  private setupErrorBoundaries(): void {
    if (!this.config.enableErrorBoundaries) return;

    // Only enable error popups in production to avoid development noise
    if (process.env.NODE_ENV === 'production') {
      // Global error handler
      window.addEventListener('error', (event) => {
        this.handleGlobalError(event.error, 'JavaScript Error');
      });

      // Promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        this.handleGlobalError(event.reason, 'Unhandled Promise Rejection');
      });
    }
  }

  /**
   * P6-3.3c: Setup navigation feedback
   */
  private setupNavigationFeedback(): void {
    if (!this.config.enableNavigationFeedback) return;

    // Track navigation performance (disabled in development to prevent spam)
    if (process.env.NODE_ENV === 'production' && 'navigation' in performance) {
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        const loadTime = navTiming.loadEventEnd - navTiming.fetchStart;
        if (loadTime > 5000) { // Only show for very slow loads
          this.showToast({
            type: 'info',
            title: 'Slow Connection Detected',
            message: 'We\'re optimizing your experience for slower connections.',
            duration: 3000
          });
        }
      }
    }
  }

  /**
   * P6-3.3d: Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!this.config.enablePerformanceHints) return;

    // Monitor Core Web Vitals (toasts disabled in development to avoid noise)
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lcp = entry.startTime;
          if (lcp > 2500) { // Poor LCP
            this.showToast({
              type: 'info',
              title: 'Loading Optimization',
              message: 'We\'re working to improve page load times.',
              duration: 3000
            });
          }
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // Cumulative Layout Shift
      new PerformanceObserver((list) => {
        let clsValue = 0;
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        // Only warn for significant layout shifts in production
        if (clsValue > 0.25 && process.env.NODE_ENV === 'production') {
          console.warn('High layout shift detected:', clsValue);
        }
      }).observe({ entryTypes: ['layout-shift'] });
    }
  }

  /**
   * P6-3.4: Loading state management
   */
  setLoading(key: string, state: LoadingState): void {
    if (!this.config.enableLoadingStates) return;

    this.loadingStates.set(key, state);
    this.emitStateChange('loading', { key, state });
  }

  getLoading(key: string): LoadingState | undefined {
    return this.loadingStates.get(key);
  }

  clearLoading(key: string): void {
    this.loadingStates.delete(key);
    this.emitStateChange('loading', { key, state: null });
  }

  isLoading(key?: string): boolean {
    if (key) {
      return this.loadingStates.get(key)?.isLoading || false;
    }
    return Array.from(this.loadingStates.values()).some(state => state.isLoading);
  }

  /**
   * P6-3.5: Toast notification system
   */
  showToast(config: ToastConfig): string {
    if (!this.config.enableToastNotifications) return '';

    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const toastWithId = { ...config, id };
    
    this.toastQueue.push(toastWithId);
    this.emitStateChange('toast', { action: 'add', toast: toastWithId });

    // Auto-remove non-persistent toasts
    if (!config.persistent) {
      const duration = config.duration || this.getDefaultToastDuration(config.type);
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }

    return id;
  }

  removeToast(id: string): void {
    const index = this.toastQueue.findIndex(toast => (toast as any).id === id);
    if (index > -1) {
      this.toastQueue.splice(index, 1);
      this.emitStateChange('toast', { action: 'remove', id });
    }
  }

  clearAllToasts(): void {
    this.toastQueue = [];
    this.emitStateChange('toast', { action: 'clear' });
  }

  private getDefaultToastDuration(type: ToastConfig['type']): number {
    switch (type) {
      case 'error': return 8000;
      case 'warning': return 6000;
      case 'success': return 4000;
      case 'info': return 5000;
      default: return 5000;
    }
  }

  /**
   * P6-3.6: Auto-save functionality
   */
  setupAutoSave(key: string, saveFunction: () => Promise<void> | void): void {
    // Clear existing timer
    if (this.autoSaveTimers.has(key)) {
      clearInterval(this.autoSaveTimers.get(key)!);
    }

    // Setup new timer
    const timer = setInterval(async () => {
      try {
        await saveFunction();
        this.showToast({
          type: 'info',
          title: 'Auto-saved',
          message: 'Your changes have been automatically saved.',
          duration: 2000
        });
      } catch (error) {
        console.error('Auto-save failed:', error);
        this.showToast({
          type: 'warning',
          title: 'Auto-save Failed',
          message: 'Unable to auto-save. Please save manually.',
          duration: 5000
        });
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(key, timer);
  }

  clearAutoSave(key: string): void {
    if (this.autoSaveTimers.has(key)) {
      clearInterval(this.autoSaveTimers.get(key)!);
      this.autoSaveTimers.delete(key);
    }
  }

  /**
   * P6-3.7: Debounced operations
   */
  debounce<T extends (...args: any[]) => any>(
    key: string,
    func: T,
    delay?: number
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      // Clear existing timer
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key)!);
      }

      // Setup new timer
      const timer = setTimeout(() => {
        func(...args);
        this.debounceTimers.delete(key);
      }, delay || this.config.debounceDelay);

      this.debounceTimers.set(key, timer);
    };
  }

  /**
   * P6-3.8: Error handling utilities
   */
  static handleGlobalError(error: Error | any, context: string): void {
    console.error(`[${context}]`, error);

    // Get instance to show toast
    const instance = UXManager.getInstance();
    instance.showToast({
      type: 'error',
      title: 'Something went wrong',
      message: 'We\'re working to fix this issue. Please try again.',
      duration: 8000,
      actions: [
        {
          label: 'Reload Page',
          action: () => window.location.reload(),
          style: 'primary'
        },
        {
          label: 'Report Issue',
          action: () => instance.reportError(error, context),
          style: 'secondary'
        }
      ]
    });
  }

  private reportError(error: Error | any, context: string): void {
    // Send error report to analytics/monitoring service
    const errorReport = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };

    // In a real app, send to error tracking service
    console.log('Error report:', errorReport);
    
    this.showToast({
      type: 'success',
      title: 'Thank you',
      message: 'Error report sent. We\'ll investigate the issue.',
      duration: 3000
    });
  }

  /**
   * P6-3.9: User feedback utilities
   */
  showSuccessMessage(message: string, details?: string): void {
    this.showToast({
      type: 'success',
      title: message,
      message: details,
      duration: 4000
    });
  }

  showErrorMessage(message: string, details?: string): void {
    this.showToast({
      type: 'error',
      title: message,
      message: details,
      duration: 6000
    });
  }

  showInfoMessage(message: string, details?: string): void {
    this.showToast({
      type: 'info',
      title: message,
      message: details,
      duration: 5000
    });
  }

  showWarningMessage(message: string, details?: string): void {
    this.showToast({
      type: 'warning',
      title: message,
      message: details,
      duration: 5000
    });
  }

  /**
   * P6-3.10: Navigation enhancement utilities
   */
  enhanceNavigation(): void {
    // Add loading indicators to navigation
    document.addEventListener('click', (e) => {
      const link = (e.target as Element).closest('a[href]') as HTMLAnchorElement;
      if (link && !link.target && link.href.startsWith(window.location.origin)) {
        this.setLoading('navigation', {
          isLoading: true,
          message: 'Loading page...'
        });
      }
    });

    // Clear navigation loading on page load
    window.addEventListener('load', () => {
      this.clearLoading('navigation');
    });
  }

  /**
   * P6-3.11: Form enhancement utilities
   */
  enhanceForm(form: HTMLFormElement): void {
    // Add real-time validation feedback
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        this.validateField(input as HTMLInputElement);
      });
    });

    // Add auto-save for form data
    const formKey = form.id || 'form_' + Date.now();
    this.setupAutoSave(formKey, () => {
      const formData = new FormData(form);
      localStorage.setItem(formKey, JSON.stringify(Object.fromEntries(formData)));
    });
  }

  private validateField(field: HTMLInputElement): void {
    const isValid = field.checkValidity();
    const feedback = field.parentElement?.querySelector('.field-feedback');
    
    if (!isValid && field.value) {
      field.classList.add('invalid');
      if (feedback) {
        feedback.textContent = field.validationMessage;
        feedback.classList.add('error');
      }
    } else {
      field.classList.remove('invalid');
      if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('error');
      }
    }
  }

  /**
   * P6-3.12: Event emitter for state changes
   */
  private emitStateChange(type: string, data: any): void {
    window.dispatchEvent(new CustomEvent(`ux:${type}`, { detail: data }));
  }

  /**
   * P6-3.13: Get current configuration
   */
  getConfig(): UXConfig {
    return { ...this.config };
  }

  /**
   * P6-3.14: Update configuration
   */
  updateConfig(newConfig: Partial<UXConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * P6-3.15: Cleanup method
   */
  cleanup(): void {
    // Clear all timers
    this.autoSaveTimers.forEach(timer => clearInterval(timer));
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    
    this.autoSaveTimers.clear();
    this.debounceTimers.clear();
    this.loadingStates.clear();
    this.toastQueue = [];
  }
}

/**
 * P6-3.16: React hooks for UX enhancement
 */
import { useEffect, useState, useCallback } from 'react';

export function useUX() {
  const uxManager = UXManager.getInstance();

  return {
    setLoading: (key: string, state: LoadingState) => uxManager.setLoading(key, state),
    clearLoading: (key: string) => uxManager.clearLoading(key),
    isLoading: (key?: string) => uxManager.isLoading(key),
    showToast: (config: ToastConfig) => uxManager.showToast(config),
    showSuccess: (message: string, details?: string) => uxManager.showSuccessMessage(message, details),
    showError: (message: string, details?: string) => uxManager.showErrorMessage(message, details),
    showInfo: (message: string, details?: string) => uxManager.showInfoMessage(message, details),
    showWarning: (message: string, details?: string) => uxManager.showWarningMessage(message, details),
    debounce: <T extends (...args: any[]) => any>(key: string, func: T, delay?: number) => 
      uxManager.debounce(key, func, delay)
  };
}

export function useLoading(key: string) {
  const uxManager = UXManager.getInstance();
  const [loadingState, setLoadingState] = useState<LoadingState | undefined>(
    uxManager.getLoading(key)
  );

  useEffect(() => {
    const handleLoadingChange = (event: CustomEvent) => {
      if (event.detail.key === key) {
        setLoadingState(event.detail.state);
      }
    };

    window.addEventListener('ux:loading', handleLoadingChange as EventListener);
    return () => {
      window.removeEventListener('ux:loading', handleLoadingChange as EventListener);
    };
  }, [key]);

  const setLoading = useCallback((state: LoadingState) => {
    uxManager.setLoading(key, state);
  }, [key, uxManager]);

  const clearLoading = useCallback(() => {
    uxManager.clearLoading(key);
  }, [key, uxManager]);

  return {
    loadingState,
    isLoading: loadingState?.isLoading || false,
    setLoading,
    clearLoading
  };
}

export function useToasts() {
  const uxManager = UXManager.getInstance();
  const [toasts, setToasts] = useState<ToastConfig[]>([]);

  useEffect(() => {
    const handleToastChange = (event: CustomEvent) => {
      const { action, toast, id } = event.detail;
      
      setToasts(currentToasts => {
        switch (action) {
          case 'add':
            return [...currentToasts, toast];
          case 'remove':
            return currentToasts.filter(t => (t as any).id !== id);
          case 'clear':
            return [];
          default:
            return currentToasts;
        }
      });
    };

    window.addEventListener('ux:toast', handleToastChange as EventListener);
    return () => {
      window.removeEventListener('ux:toast', handleToastChange as EventListener);
    };
  }, []);

  return {
    toasts,
    showToast: (config: ToastConfig) => uxManager.showToast(config),
    removeToast: (id: string) => uxManager.removeToast(id),
    clearAll: () => uxManager.clearAllToasts()
  };
}

export function useAutoSave(key: string, saveFunction: () => Promise<void> | void) {
  const uxManager = UXManager.getInstance();

  useEffect(() => {
    uxManager.setupAutoSave(key, saveFunction);
    
    return () => {
      uxManager.clearAutoSave(key);
    };
  }, [key, saveFunction, uxManager]);
}

/**
 * P6-3.17: Initialize UX enhancement system
 */
export function initializeUXEnhancements(config?: Partial<UXConfig>): void {
  const uxManager = UXManager.getInstance();
  uxManager.initialize(config);
}