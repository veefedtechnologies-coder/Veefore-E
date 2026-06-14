/**
 * Mobile Performance Utilities
 * 
 * Provides network monitoring, adaptive loading strategies,
 * battery optimization, and performance optimization utilities
 * for mobile devices.
 * 
 * @module shared/utils/mobile/performance
 */

export type NetworkType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
export type LoadingStrategy = 'aggressive' | 'balanced' | 'conservative';

export interface NetworkInfo {
  type: NetworkType;
  downlink: number; // Mbps
  rtt: number; // Round trip time in ms
  saveData: boolean;
  effectiveType: NetworkType;
  isOnline: boolean;
}

export interface BatteryInfo {
  level: number; // 0-1
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export interface DeviceCapabilities {
  memory: number; // GB
  cores: number;
  maxTouchPoints: number;
  hardwareConcurrency: number;
}

export interface PerformanceMetrics {
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  ttfb: number; // Time to First Byte
}

/**
 * Network Monitor
 * Monitors network connection and provides adaptive loading strategies
 */
export class NetworkMonitor {
  private static instance: NetworkMonitor;
  private listeners: Set<(info: NetworkInfo) => void> = new Set();
  private currentInfo: NetworkInfo | null = null;

  static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
  }

  constructor() {
    this.initialize();
  }

  /**
   * Initialize network monitoring
   */
  private initialize(): void {
    // Modern Network Information API
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      this.updateNetworkInfo();

      connection.addEventListener('change', () => {
        this.updateNetworkInfo();
      });
    }

    // Fallback: Online/offline events
    window.addEventListener('online', () => this.updateNetworkInfo());
    window.addEventListener('offline', () => this.updateNetworkInfo());
  }

  /**
   * Update network information
   */
  private updateNetworkInfo(): void {
    const connection = (navigator as any).connection;
    const isOnline = navigator.onLine;

    this.currentInfo = {
      type: connection?.type || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false,
      effectiveType: connection?.effectiveType || 'unknown',
      isOnline,
    };

    // Notify listeners
    this.listeners.forEach((listener) => {
      if (this.currentInfo) {
        listener(this.currentInfo);
      }
    });
  }

  /**
   * Get current network information
   */
  getNetworkInfo(): NetworkInfo | null {
    return this.currentInfo;
  }

  /**
   * Subscribe to network changes
   */
  subscribe(callback: (info: NetworkInfo) => void): () => void {
    this.listeners.add(callback);

    // Call immediately with current info
    if (this.currentInfo) {
      callback(this.currentInfo);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Check if connection is slow
   */
  isSlowConnection(): boolean {
    if (!this.currentInfo) return false;

    return (
      this.currentInfo.effectiveType === 'slow-2g' ||
      this.currentInfo.effectiveType === '2g' ||
      this.currentInfo.saveData
    );
  }

  /**
   * Check if connection is fast
   */
  isFastConnection(): boolean {
    if (!this.currentInfo) return false;

    return (
      this.currentInfo.effectiveType === '4g' &&
      this.currentInfo.downlink > 2 &&
      !this.currentInfo.saveData
    );
  }

  /**
   * Get recommended loading strategy
   */
  getLoadingStrategy(): LoadingStrategy {
    if (this.isSlowConnection()) return 'conservative';
    if (this.isFastConnection()) return 'aggressive';
    return 'balanced';
  }
}

/**
 * Battery Monitor
 * Monitors battery status and provides power-saving recommendations
 */
export class BatteryMonitor {
  private static instance: BatteryMonitor;
  private batteryManager: any = null;
  private listeners: Set<(info: BatteryInfo) => void> = new Set();
  private currentInfo: BatteryInfo | null = null;

  static getInstance(): BatteryMonitor {
    if (!BatteryMonitor.instance) {
      BatteryMonitor.instance = new BatteryMonitor();
    }
    return BatteryMonitor.instance;
  }

  constructor() {
    this.initialize();
  }

  /**
   * Initialize battery monitoring
   */
  private async initialize(): Promise<void> {
    try {
      if ('getBattery' in navigator) {
        this.batteryManager = await (navigator as any).getBattery();

        // Setup event listeners
        this.batteryManager.addEventListener('levelchange', () =>
          this.updateBatteryInfo()
        );
        this.batteryManager.addEventListener('chargingchange', () =>
          this.updateBatteryInfo()
        );

        this.updateBatteryInfo();
      }
    } catch (error) {
      console.warn('Battery API not available:', error);
    }
  }

  /**
   * Update battery information
   */
  private updateBatteryInfo(): void {
    if (!this.batteryManager) return;

    this.currentInfo = {
      level: this.batteryManager.level,
      charging: this.batteryManager.charging,
      chargingTime: this.batteryManager.chargingTime,
      dischargingTime: this.batteryManager.dischargingTime,
    };

    // Notify listeners
    this.listeners.forEach((listener) => {
      if (this.currentInfo) {
        listener(this.currentInfo);
      }
    });
  }

  /**
   * Get current battery information
   */
  getBatteryInfo(): BatteryInfo | null {
    return this.currentInfo;
  }

  /**
   * Subscribe to battery changes
   */
  subscribe(callback: (info: BatteryInfo) => void): () => void {
    this.listeners.add(callback);

    // Call immediately with current info
    if (this.currentInfo) {
      callback(this.currentInfo);
    }

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Check if battery is low
   */
  isLowBattery(): boolean {
    if (!this.currentInfo) return false;
    return this.currentInfo.level < 0.2 && !this.currentInfo.charging;
  }

  /**
   * Check if power saving mode should be enabled
   */
  shouldEnablePowerSaving(): boolean {
    return this.isLowBattery();
  }
}

/**
 * Device Capabilities Detector
 */
export function getDeviceCapabilities(): DeviceCapabilities {
  return {
    memory: (navigator as any).deviceMemory || 4,
    cores: navigator.hardwareConcurrency || 4,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  };
}

/**
 * Classify device performance tier
 */
export function getDeviceTier(): 'low' | 'medium' | 'high' {
  const capabilities = getDeviceCapabilities();

  if (capabilities.memory <= 2 || capabilities.cores <= 2) {
    return 'low';
  }

  if (capabilities.memory >= 8 && capabilities.cores >= 8) {
    return 'high';
  }

  return 'medium';
}

/**
 * Adaptive Image Loader
 * Loads images based on network and device capabilities
 */
export interface AdaptiveImageOptions {
  lowQuality: string;
  mediumQuality: string;
  highQuality: string;
  placeholder?: string;
}

export function loadAdaptiveImage(
  options: AdaptiveImageOptions
): Promise<string> {
  return new Promise((resolve) => {
    const networkMonitor = NetworkMonitor.getInstance();
    const strategy = networkMonitor.getLoadingStrategy();
    const deviceTier = getDeviceTier();

    let selectedSrc: string;

    // Select appropriate image based on network and device
    if (strategy === 'conservative' || deviceTier === 'low') {
      selectedSrc = options.lowQuality;
    } else if (strategy === 'aggressive' && deviceTier === 'high') {
      selectedSrc = options.highQuality;
    } else {
      selectedSrc = options.mediumQuality;
    }

    // Show placeholder first if available
    if (options.placeholder) {
      resolve(options.placeholder);
    }

    // Preload the actual image
    const img = new Image();
    img.onload = () => resolve(selectedSrc);
    img.onerror = () => resolve(options.lowQuality); // Fallback
    img.src = selectedSrc;
  });
}

/**
 * Lazy Load Manager
 * Manages lazy loading with adaptive strategies
 */
export class LazyLoadManager {
  private observer: IntersectionObserver | null = null;
  private strategy: LoadingStrategy = 'balanced';

  constructor() {
    this.initialize();
  }

  /**
   * Initialize lazy loading
   */
  private initialize(): void {
    const networkMonitor = NetworkMonitor.getInstance();
    this.strategy = networkMonitor.getLoadingStrategy();

    // Adjust intersection observer options based on strategy
    const options: IntersectionObserverInit = {
      rootMargin: this.getRootMargin(),
      threshold: 0.01,
    };

    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.loadElement(entry.target as HTMLElement);
            this.observer?.unobserve(entry.target);
          }
        });
      }, options);
    }
  }

  /**
   * Get root margin based on loading strategy
   */
  private getRootMargin(): string {
    switch (this.strategy) {
      case 'aggressive':
        return '200px'; // Load 200px before visible
      case 'conservative':
        return '50px'; // Load 50px before visible
      default:
        return '100px'; // Balanced: 100px before visible
    }
  }

  /**
   * Load an element
   */
  private loadElement(element: HTMLElement): void {
    if (element.tagName === 'IMG') {
      const img = element as HTMLImageElement;
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.removeAttribute('data-src');
      }
    } else {
      // Handle other elements (videos, iframes, etc.)
      const src = element.dataset.src;
      if (src) {
        element.setAttribute('src', src);
        element.removeAttribute('data-src');
      }
    }
  }

  /**
   * Observe an element for lazy loading
   */
  observe(element: HTMLElement): void {
    if (this.observer) {
      this.observer.observe(element);
    } else {
      // Fallback: load immediately
      this.loadElement(element);
    }
  }

  /**
   * Disconnect observer
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

/**
 * Performance Metrics Collector
 */
export class PerformanceMetricsCollector {
  private metrics: Partial<PerformanceMetrics> = {};

  constructor() {
    this.collectMetrics();
  }

  /**
   * Collect web vitals metrics
   */
  private collectMetrics(): void {
    // Use PerformanceObserver if available
    if ('PerformanceObserver' in window) {
      // First Contentful Paint
      this.observePaint('first-contentful-paint', (entry) => {
        this.metrics.fcp = entry.startTime;
      });

      // Largest Contentful Paint
      this.observeLCP();

      // First Input Delay
      this.observeFID();

      // Cumulative Layout Shift
      this.observeCLS();
    }

    // Time to First Byte
    this.collectTTFB();
  }

  /**
   * Observe paint timing
   */
  private observePaint(
    name: string,
    callback: (entry: PerformanceEntry) => void
  ): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const entry = entries.find((e) => e.name === name);
      if (entry) {
        callback(entry);
        observer.disconnect();
      }
    });

    observer.observe({ entryTypes: ['paint'] });
  }

  /**
   * Observe Largest Contentful Paint
   */
  private observeLCP(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.metrics.lcp = lastEntry.startTime;
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  }

  /**
   * Observe First Input Delay
   */
  private observeFID(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (entry.name === 'first-input') {
          this.metrics.fid = entry.processingStart - entry.startTime;
        }
      });
    });

    observer.observe({ entryTypes: ['first-input'] });
  }

  /**
   * Observe Cumulative Layout Shift
   */
  private observeCLS(): void {
    let clsScore = 0;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsScore += entry.value;
          this.metrics.cls = clsScore;
        }
      });
    });

    observer.observe({ entryTypes: ['layout-shift'] });
  }

  /**
   * Collect Time to First Byte
   */
  private collectTTFB(): void {
    const navigationTiming = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;

    if (navigationTiming) {
      this.metrics.ttfb =
        navigationTiming.responseStart - navigationTiming.requestStart;
    }
  }

  /**
   * Get collected metrics
   */
  getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics };
  }

  /**
   * Log metrics to console (for debugging)
   */
  logMetrics(): void {
    console.table(this.metrics);
  }
}

/**
 * Prefetch Manager
 * Manages resource prefetching based on network conditions
 */
export function prefetchResource(
  url: string,
  type: 'script' | 'style' | 'image' | 'fetch' = 'fetch'
): void {
  const networkMonitor = NetworkMonitor.getInstance();

  // Only prefetch on fast connections
  if (!networkMonitor.isFastConnection()) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = type;
  link.href = url;

  document.head.appendChild(link);
}

/**
 * Preload critical resources
 */
export function preloadResource(
  url: string,
  type: 'script' | 'style' | 'image' | 'font'
): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = type;
  link.href = url;

  if (type === 'font') {
    link.setAttribute('crossorigin', 'anonymous');
  }

  document.head.appendChild(link);
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Request Idle Callback wrapper
 */
export function runWhenIdle(callback: () => void, timeout = 2000): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
