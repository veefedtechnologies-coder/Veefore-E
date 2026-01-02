/**
 * P7.4: Core Web Vitals Optimization
 * 
 * Advanced performance monitoring and optimization utilities
 * targeting ≥90 Lighthouse scores across all categories
 */

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  entries: PerformanceEntry[];
}

interface PerformanceThresholds {
  LCP: { good: number; poor: number };
  FID: { good: number; poor: number };
  CLS: { good: number; poor: number };
  TTFB: { good: number; poor: number };
  INP: { good: number; poor: number };
}

/**
 * P7.4: Core Web Vitals Monitoring Class
 */
export class WebVitalsMonitor {
  private static metrics = new Map<string, WebVitalMetric>();
  private static observers = new Map<string, PerformanceObserver>();
  
  private static thresholds: PerformanceThresholds = {
    LCP: { good: 2500, poor: 4000 },
    FID: { good: 100, poor: 300 },
    CLS: { good: 0.1, poor: 0.25 },
    TTFB: { good: 800, poor: 1800 },
    INP: { good: 200, poor: 500 }
  };

  /**
   * Initialize Core Web Vitals monitoring
   */
  static initialize(): void {
    this.measureLCP();
    this.measureFID();
    this.measureCLS();
    this.measureTTFB();
    this.measureINP();
    this.measureCustomMetrics();

    console.log('📊 P7.4: Core Web Vitals monitoring initialized');
  }

  /**
   * Largest Contentful Paint (LCP) Measurement
   */
  private static measureLCP(): void {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      
      this.recordMetric('LCP', lastEntry.startTime, entries, 'LCP');
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });
    this.observers.set('LCP', observer);
  }

  /**
   * First Input Delay (FID) Measurement
   */
  private static measureFID(): void {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        this.recordMetric('FID', entry.processingStart - entry.startTime, [entry], 'FID');
      });
    });

    observer.observe({ entryTypes: ['first-input'] });
    this.observers.set('FID', observer);
  }

  /**
   * Cumulative Layout Shift (CLS) Measurement
   */
  private static measureCLS(): void {
    if (!('PerformanceObserver' in window)) return;

    let clsValue = 0;
    const clsEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          clsEntries.push(entry);
        }
      });

      this.recordMetric('CLS', clsValue, clsEntries, 'CLS');
    });

    observer.observe({ entryTypes: ['layout-shift'] });
    this.observers.set('CLS', observer);
  }

  /**
   * Time to First Byte (TTFB) Measurement
   */
  private static measureTTFB(): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      const ttfb = navigation.responseStart - navigation.requestStart;
      this.recordMetric('TTFB', ttfb, [navigation], 'TTFB');
    }
  }

  /**
   * Interaction to Next Paint (INP) Measurement
   */
  private static measureINP(): void {
    if (!('PerformanceObserver' in window)) return;

    let maxDelay = 0;
    const inpEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        const delay = entry.processingStart - entry.startTime + entry.duration;
        if (delay > maxDelay) {
          maxDelay = delay;
          inpEntries.push(entry);
        }
      });

      this.recordMetric('INP', maxDelay, inpEntries, 'INP');
    });

    observer.observe({ entryTypes: ['event'] });
    this.observers.set('INP', observer);
  }

  /**
   * Custom Performance Metrics
   */
  private static measureCustomMetrics(): void {
    // Time to Interactive (TTI) estimation
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (entry.name === 'first-contentful-paint') {
          // Estimate TTI as FCP + main thread idle time
          setTimeout(() => {
            const tti = entry.startTime + this.getMainThreadIdleTime();
            this.recordMetric('TTI', tti, [entry], 'custom');
          }, 5000);
        }
      });
    });

    observer.observe({ entryTypes: ['paint'] });

    // Resource load times
    const resourceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const slowResources = entries.filter((entry: any) => entry.duration > 1000);
      
      if (slowResources.length > 0) {
        console.warn('⚠️ P7.4: Slow resources detected:', slowResources.map(r => ({
          name: r.name,
          duration: Math.round(r.duration),
          type: (r as any).initiatorType
        })));
      }
    });

    resourceObserver.observe({ entryTypes: ['resource'] });
  }

  /**
   * Record a performance metric
   */
  private static recordMetric(name: string, value: number, entries: PerformanceEntry[], category: keyof PerformanceThresholds | 'custom'): void {
    const rating = category !== 'custom' ? this.getRating(name as keyof PerformanceThresholds, value) : 'good';
    const delta = this.metrics.has(name) ? value - this.metrics.get(name)!.value : value;

    const metric: WebVitalMetric = {
      name,
      value: Math.round(value * 100) / 100,
      rating,
      delta: Math.round(delta * 100) / 100,
      id: this.generateId(),
      entries
    };

    this.metrics.set(name, metric);

    // Log metric
    console.log(`📈 Web Vital - ${name}: ${metric.value.toFixed(2)}ms (${rating})`, metric);

    // Send to analytics (if needed)
    this.sendMetricToAnalytics(metric);

    // Apply optimizations based on metrics
    this.applyOptimizations(metric);
  }

  /**
   * Get performance rating
   */
  private static getRating(metricName: keyof PerformanceThresholds, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = this.thresholds[metricName];
    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Apply optimizations based on performance metrics
   */
  private static applyOptimizations(metric: WebVitalMetric): void {
    switch (metric.name) {
      case 'LCP':
        if (metric.rating !== 'good') {
          console.log('🎯 P7.4: Applying LCP optimizations');
          this.optimizeLCP();
        }
        break;
      
      case 'CLS':
        if (metric.rating !== 'good') {
          console.log('🎯 P7.4: Applying CLS optimizations');
          this.optimizeCLS();
        }
        break;
      
      case 'FID':
      case 'INP':
        if (metric.rating !== 'good') {
          console.log('🎯 P7.4: Applying interaction optimizations');
          this.optimizeInteraction();
        }
        break;
    }
  }

  /**
   * LCP Optimization Strategies
   */
  private static optimizeLCP(): void {
    // Preload critical resources
    const criticalImages = document.querySelectorAll('img[data-critical]');
    criticalImages.forEach(img => {
      if (img instanceof HTMLImageElement && !img.complete) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = img.src;
        document.head.appendChild(link);
      }
    });

    // Optimize font loading
    document.fonts.ready.then(() => {
      console.log('🔤 P7.4: Fonts loaded, LCP should improve');
    });
  }

  /**
   * CLS Optimization Strategies
   */
  private static optimizeCLS(): void {
    // Add dimension attributes to images
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      if (img instanceof HTMLImageElement) {
        // Use natural dimensions as fallback
        img.onload = () => {
          if (!img.width) img.width = img.naturalWidth;
          if (!img.height) img.height = img.naturalHeight;
        };
      }
    });

    // Reserve space for dynamic content
    const dynamicContainers = document.querySelectorAll('[data-dynamic]');
    dynamicContainers.forEach(container => {
      if (container instanceof HTMLElement && !container.style.minHeight) {
        container.style.minHeight = '200px'; // Reserve space
      }
    });
  }

  /**
   * Interaction Optimization Strategies
   */
  private static optimizeInteraction(): void {
    // Debounce rapid interactions
    let interactionTimeout: NodeJS.Timeout;
    document.addEventListener('click', () => {
      clearTimeout(interactionTimeout);
      interactionTimeout = setTimeout(() => {
        // Process queued interactions
        console.log('🖱️ P7.4: Processing queued interactions');
      }, 50);
    });

    // Prioritize visible elements - use transform3d instead of will-change to avoid GPU layer explosion
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          entry.target.style.transform = 'translateZ(0)';
        }
      });
    });

    document.querySelectorAll('[data-interactive]').forEach(el => observer.observe(el));
  }

  /**
   * Get main thread idle time estimation
   */
  private static getMainThreadIdleTime(): number {
    const longTasks = performance.getEntriesByType('longtask');
    const totalBlockingTime = longTasks.reduce((total: number, task: any) => {
      return total + Math.max(0, task.duration - 50);
    }, 0);
    
    return Math.max(0, 5000 - totalBlockingTime); // Estimate idle time
  }

  /**
   * Send metric to analytics
   */
  private static sendMetricToAnalytics(metric: WebVitalMetric): void {
    // Integration with analytics service would go here
    if (window.gtag) {
      window.gtag('event', metric.name, {
        event_category: 'Web Vitals',
        value: Math.round(metric.value),
        custom_parameter_1: metric.rating
      });
    }
  }

  /**
   * Generate unique metric ID
   */
  private static generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get current metrics summary
   */
  static getMetrics(): Map<string, WebVitalMetric> {
    return new Map(this.metrics);
  }

  /**
   * Get performance score estimation
   */
  static getPerformanceScore(): number {
    const metrics = Array.from(this.metrics.values());
    if (metrics.length === 0) return 100;

    const scores = metrics.map(metric => {
      switch (metric.rating) {
        case 'good': return 100;
        case 'needs-improvement': return 75;
        case 'poor': return 25;
        default: return 100;
      }
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Cleanup observers
   */
  static cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }
}

/**
 * P7.4: Performance Optimization Utilities
 */
export class PerformanceOptimizer {
  /**
   * Optimize images for better LCP
   */
  static optimizeImages(): void {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      // Add loading="lazy" for non-critical images
      if (!img.hasAttribute('data-critical')) {
        img.loading = 'lazy';
      }
      
      // Add decoding="async" for better performance
      img.decoding = 'async';
    });

    console.log('🖼️ P7.4: Optimized', images.length, 'images');
  }

  /**
   * Optimize scripts for better performance
   */
  static optimizeScripts(): void {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      if (!script.hasAttribute('async') && !script.hasAttribute('defer')) {
        script.setAttribute('defer', '');
      }
    });

    console.log('📜 P7.4: Optimized', scripts.length, 'scripts');
  }

  /**
   * Add resource hints for critical resources
   */
  static addResourceHints(): void {
    const hints = [
      { rel: 'dns-prefetch', href: '//fonts.googleapis.com' },
      { rel: 'dns-prefetch', href: '//api.veefore.com' },
      { rel: 'preconnect', href: '//fonts.gstatic.com', crossorigin: '' }
    ];

    hints.forEach(hint => {
      const link = document.createElement('link');
      link.rel = hint.rel;
      link.href = hint.href;
      if (hint.crossorigin) link.crossOrigin = hint.crossorigin;
      document.head.appendChild(link);
    });

    console.log('🔗 P7.4: Added resource hints');
  }
}

/**
 * Initialize Core Web Vitals monitoring
 */
export function initializeCoreWebVitals(): void {
  WebVitalsMonitor.initialize();
  PerformanceOptimizer.optimizeImages();
  PerformanceOptimizer.optimizeScripts();
  PerformanceOptimizer.addResourceHints();

  console.log('⚡ P7.4: Core Web Vitals optimization system initialized');
}

// Global type declarations
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}