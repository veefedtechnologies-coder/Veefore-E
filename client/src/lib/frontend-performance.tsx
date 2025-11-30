/**
 * P6-5: Frontend Performance Optimization
 * 
 * Production-grade frontend performance optimization with code splitting,
 * lazy loading, image optimization, and Core Web Vitals monitoring
 */

/**
 * P6-5.1: Performance configuration and interfaces
 */
export interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableImageOptimization: boolean;
  enableCodeSplitting: boolean;
  enablePrefetching: boolean;
  enableWebVitalsMonitoring: boolean;
  enableResourceHints: boolean;
  imageQuality: number;
  lazyLoadingThreshold: number; // pixels
  prefetchDelay: number; // milliseconds
}

export interface WebVitals {
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  fcp: number; // First Contentful Paint
  ttfb: number; // Time to First Byte
}

export interface PerformanceMetrics {
  pageLoadTime: number;
  domContentLoaded: number;
  resourcesLoaded: number;
  memoryUsage: number;
  connectionType: string;
  deviceType: string;
  performanceScore: number;
}

/**
 * P6-5.2: Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableLazyLoading: true,
  enableImageOptimization: true,
  enableCodeSplitting: true,
  enablePrefetching: true,
  enableWebVitalsMonitoring: true,
  enableResourceHints: true,
  imageQuality: 80,
  lazyLoadingThreshold: 300,
  prefetchDelay: 2000
};

/**
 * P6-5.3: Frontend performance optimizer
 */
export class FrontendPerformanceOptimizer {
  private static instance: FrontendPerformanceOptimizer;
  private config: PerformanceConfig = DEFAULT_PERFORMANCE_CONFIG;
  private webVitals: Partial<WebVitals> = {};
  private observers: PerformanceObserver[] = [];
  private lazyImages = new Set<HTMLImageElement>();
  private prefetchedResources = new Set<string>();

  static getInstance(): FrontendPerformanceOptimizer {
    if (!FrontendPerformanceOptimizer.instance) {
      FrontendPerformanceOptimizer.instance = new FrontendPerformanceOptimizer();
    }
    return FrontendPerformanceOptimizer.instance;
  }

  /**
   * P6-5.3a: Initialize performance optimization
   */
  initialize(config?: Partial<PerformanceConfig>): void {
    this.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
    if ((import.meta as any).env?.DEV) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      }
    }
    
    this.setupWebVitalsMonitoring();
    this.setupLazyLoading();
    this.setupResourceHints();
    this.setupPrefetching();
    this.optimizePageLoad();
    
    console.log('⚡ P6-5: Frontend performance optimization system initialized');
  }

  /**
   * P6-5.3b: Setup Web Vitals monitoring
   */
  private setupWebVitalsMonitoring(): void {
    if (!this.config.enableWebVitalsMonitoring || !('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.webVitals.lcp = lastEntry.startTime;
      this.reportWebVital('LCP', lastEntry.startTime);
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    this.observers.push(lcpObserver);

    // First Input Delay (FID)
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.fid = (entry as any).processingStart - entry.startTime;
        this.reportWebVital('FID', this.webVitals.fid);
      }
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
    this.observers.push(fidObserver);

    // Cumulative Layout Shift (CLS)
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      this.webVitals.cls = clsValue;
      this.reportWebVital('CLS', clsValue);
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });
    this.observers.push(clsObserver);

    // First Contentful Paint (FCP)
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          this.webVitals.fcp = entry.startTime;
          this.reportWebVital('FCP', entry.startTime);
        }
      }
    });
    fcpObserver.observe({ entryTypes: ['paint'] });
    this.observers.push(fcpObserver);

    // Navigation timing for TTFB
    if (performance.navigation) {
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        this.webVitals.ttfb = navTiming.responseStart - navTiming.fetchStart;
        this.reportWebVital('TTFB', this.webVitals.ttfb);
      }
    }
  }

  /**
   * P6-5.3c: Setup lazy loading
   */
  private setupLazyLoading(): void {
    if (!this.config.enableLazyLoading) return;

    // Native lazy loading support
    if ('loading' in HTMLImageElement.prototype) {
      document.querySelectorAll('img[data-src]').forEach((img) => {
        const imgElement = img as HTMLImageElement;
        imgElement.loading = 'lazy';
        imgElement.src = imgElement.dataset.src!;
        imgElement.removeAttribute('data-src');
      });
    } else {
      // Intersection Observer fallback
      this.setupIntersectionObserver();
    }

    // Setup lazy loading for dynamically added images
    this.observeNewImages();
  }

  /**
   * P6-5.3d: Setup Intersection Observer for lazy loading
   */
  private setupIntersectionObserver(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            this.loadImage(img);
            observer.unobserve(img);
            this.lazyImages.delete(img);
          }
        });
      },
      {
        rootMargin: `${this.config.lazyLoadingThreshold}px`
      }
    );

    document.querySelectorAll('img[data-src]').forEach((img) => {
      const imgElement = img as HTMLImageElement;
      observer.observe(imgElement);
      this.lazyImages.add(imgElement);
    });
  }

  /**
   * P6-5.3e: Load image with optimization
   */
  private loadImage(img: HTMLImageElement): void {
    const dataSrc = img.dataset.src;
    if (!dataSrc) return;

    // Add loading class
    img.classList.add('loading');

    // Create optimized image URL
    const optimizedSrc = this.optimizeImageUrl(dataSrc);

    // Preload the image
    const imageLoader = new Image();
    imageLoader.onload = () => {
      img.src = optimizedSrc;
      img.classList.remove('loading');
      img.classList.add('loaded');
      
      // Remove data-src to prevent reloading
      img.removeAttribute('data-src');
    };
    
    imageLoader.onerror = () => {
      img.classList.remove('loading');
      img.classList.add('error');
      // Fallback to original src
      img.src = dataSrc;
    };
    
    imageLoader.src = optimizedSrc;
  }

  /**
   * P6-5.3f: Optimize image URL
   */
  private optimizeImageUrl(src: string): string {
    if (!this.config.enableImageOptimization) return src;

    // Only optimize if it's our own images
    if (!src.startsWith('/') && !src.includes(window.location.hostname)) {
      return src;
    }

    // Add optimization parameters
    const url = new URL(src, window.location.origin);
    
    // Auto-detect optimal format
    const supportsWebP = this.supportsImageFormat('webp');
    const supportsAVIF = this.supportsImageFormat('avif');
    
    if (supportsAVIF) {
      url.searchParams.set('format', 'avif');
    } else if (supportsWebP) {
      url.searchParams.set('format', 'webp');
    }
    
    // Set quality
    url.searchParams.set('quality', this.config.imageQuality.toString());
    
    // Auto-sizing based on container
    const container = document.querySelector('img[data-src="' + src + '"]')?.parentElement;
    if (container) {
      const containerWidth = container.clientWidth;
      if (containerWidth > 0) {
        // Round to common breakpoints
        const width = this.roundToBreakpoint(containerWidth * window.devicePixelRatio);
        url.searchParams.set('width', width.toString());
      }
    }

    return url.toString();
  }

  /**
   * P6-5.3g: Image format support detection
   */
  private supportsImageFormat(format: string): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    
    try {
      return canvas.toDataURL(`image/${format}`).indexOf(`data:image/${format}`) === 0;
    } catch {
      return false;
    }
  }

  /**
   * P6-5.3h: Round width to common breakpoints
   */
  private roundToBreakpoint(width: number): number {
    const breakpoints = [320, 480, 640, 768, 1024, 1280, 1440, 1920, 2560];
    return breakpoints.find(bp => bp >= width) || width;
  }

  /**
   * P6-5.3i: Observe new images
   */
  private observeNewImages(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const images = element.querySelectorAll ? 
              element.querySelectorAll('img[data-src]') : 
              element.matches && element.matches('img[data-src]') ? [element] : [];
            
            images.forEach((img) => {
              const imgElement = img as HTMLImageElement;
              if (this.config.enableLazyLoading && !this.lazyImages.has(imgElement)) {
                this.setupLazyImage(imgElement);
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * P6-5.3j: Setup lazy image
   */
  private setupLazyImage(img: HTMLImageElement): void {
    if ('loading' in HTMLImageElement.prototype) {
      img.loading = 'lazy';
      img.src = img.dataset.src!;
      img.removeAttribute('data-src');
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.loadImage(entry.target as HTMLImageElement);
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: `${this.config.lazyLoadingThreshold}px` }
      );
      
      observer.observe(img);
      this.lazyImages.add(img);
    }
  }

  /**
   * P6-5.3k: Setup resource hints - AGGRESSIVE OPTIMIZATION
   */
  private setupResourceHints(): void {
    if (!this.config.enableResourceHints) return;

    // CRITICAL: Preload key CSS and JS files immediately
    this.preloadCriticalAssets();

    // Preconnect to critical domains (faster than DNS prefetch)
    const criticalDomains = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'api.stripe.com',
      'js.stripe.com'
    ];

    criticalDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = `https://${domain}`;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });

    // DNS prefetch for additional external domains
    const prefetchDomains = [
      'api.instagram.com',
      'graph.facebook.com',
      'cdn.jsdelivr.net'
    ];

    prefetchDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });

    // Preload critical fonts with font-display swap
    this.preloadCriticalFonts();
  }

  /**
   * P6-5.3k1: Preload critical assets for faster LCP
   */
  private preloadCriticalAssets(): void {
    // Preload critical CSS first (highest priority)
    const criticalCSS = [
      '/src/index.css'
    ];

    criticalCSS.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = href;
      link.onload = function() { 
        (this as any).onload = null; 
        (this as any).rel = 'stylesheet'; 
      };
      document.head.appendChild(link);
    });

    // Preload critical JavaScript modules
    const criticalJS = [
      '/src/main.tsx',
      '/src/App.tsx'
    ];

    criticalJS.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      document.head.appendChild(link);
    });

    // Preload critical images that are above the fold
    const criticalImages = [
      // Favicon removed - browser handles it automatically, preloading causes warnings
    ];

    criticalImages.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  /**
   * P6-5.3k2: Preload critical fonts optimally
   */
  private preloadCriticalFonts(): void {
    // Preload critical font files directly (bypass Google Fonts CSS)
    const criticalFonts = [
      'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2'
    ];

    criticalFonts.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });

    // Inject critical font CSS with font-display: swap
    const fontCSS = `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400 700;
        font-display: swap;
        src: url('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2') format('woff2');
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
    `;

    const style = document.createElement('style');
    style.textContent = fontCSS;
    document.head.appendChild(style);
  }

  /**
   * P6-5.3l: Setup prefetching
   */
  private setupPrefetching(): void {
    if (!this.config.enablePrefetching) return;

    // Prefetch likely next pages on hover
    document.addEventListener('mouseover', (e) => {
      const link = (e.target as Element).closest('a[href]') as HTMLAnchorElement;
      if (link && this.shouldPrefetch(link.href)) {
        setTimeout(() => {
          this.prefetchResource(link.href);
        }, this.config.prefetchDelay);
      }
    });

    // Prefetch on focus for keyboard navigation
    document.addEventListener('focusin', (e) => {
      const link = e.target as HTMLAnchorElement;
      if (link.tagName === 'A' && link.href && this.shouldPrefetch(link.href)) {
        this.prefetchResource(link.href);
      }
    });
  }

  /**
   * P6-5.3m: Check if resource should be prefetched
   */
  private shouldPrefetch(url: string): boolean {
    // Don't prefetch external links
    if (!url.startsWith(window.location.origin) && !url.startsWith('/')) {
      return false;
    }

    // Don't prefetch if already prefetched
    if (this.prefetchedResources.has(url)) {
      return false;
    }

    // Don't prefetch on slow connections
    if (this.isSlowConnection()) {
      return false;
    }

    return true;
  }

  /**
   * P6-5.3n: Prefetch resource
   */
  private prefetchResource(url: string): void {
    if (this.prefetchedResources.has(url)) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    
    document.head.appendChild(link);
    this.prefetchedResources.add(url);
  }

  /**
   * P6-5.3o: Check if connection is slow
   */
  private isSlowConnection(): boolean {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return connection.effectiveType === 'slow-2g' || 
             connection.effectiveType === '2g' ||
             connection.saveData === true;
    }
    return false;
  }

  /**
   * P6-5.3p: Optimize page load - AGGRESSIVE
   */
  private optimizePageLoad(): void {
    // CRITICAL: Install service worker immediately
    this.installServiceWorker();
    
    // Optimize font loading
    this.optimizeFontLoading();
    
    // Remove unused CSS
    this.removeUnusedCSS();
    
    // Optimize JavaScript execution
    this.optimizeJavaScript();
    
    // Fix layout shifts
    this.preventLayoutShifts();
  }

  /**
   * P6-5.3p1: Install aggressive service worker
   */
  private installServiceWorker(): void {
    // Disable service worker in development to avoid stale module cache (Outdated Optimize Dep)
    if ((import.meta as any).env?.DEV) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => {
          console.log('⚡ SW: Service worker registered successfully');
          
          // Update on new version
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
          
          // Cache additional critical resources
          this.cacheAdditionalResources();
        })
        .catch(error => {
          console.warn('SW: Service worker registration failed:', error);
        });
    }
  }

  /**
   * P6-5.3p2: Cache additional critical resources
   */
  private cacheAdditionalResources(): void {
    const additionalResources = [
      '/src/components/analytics/analytics-dashboard.tsx',
      '/src/components/create/create-post.tsx',
      '/src/hooks/useFirebaseAuth.ts',
      '/src/lib/firebase.ts'
    ];

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_URLS',
        payload: additionalResources
      });
    }
  }

  /**
   * P6-5.3p3: Prevent layout shifts aggressively
   */
  private preventLayoutShifts(): void {
    // Set explicit dimensions for dynamic content containers
    const dynamicContainers = [
      '[data-dynamic]',
      '.dashboard-content',
      '.analytics-container',
      '.chart-container'
    ];

    dynamicContainers.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const el = element as HTMLElement;
        if (!el.style.minHeight) {
          el.style.minHeight = '200px';
        }
        if (!el.style.transition) {
          el.style.transition = 'height 0.3s ease';
        }
      });
    });

    // Reserve space for images
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      const imgElement = img as HTMLImageElement;
      if (!imgElement.style.aspectRatio) {
        imgElement.style.aspectRatio = '16/9';
        imgElement.style.objectFit = 'cover';
      }
    });

    // Prevent text reflow on font load
    (document.body.style as any).fontDisplay = 'swap';
  }

  /**
   * P6-5.3q: Optimize font loading - AGGRESSIVE
   */
  private optimizeFontLoading(): void {
    // Immediately add fonts-loading class to prevent FOIT (Flash of Invisible Text)
    document.body.classList.add('fonts-loading');
    
    // Use font-display: swap for all fonts
    const fontCSS = `
      * {
        font-display: swap !important;
      }
      
      .fonts-loading {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      
      .fonts-loaded {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
    `;
    
    const style = document.createElement('style');
    style.textContent = fontCSS;
    document.head.appendChild(style);

    // Fast font loading with timeout fallback
    const fontLoadTimeout = setTimeout(() => {
      document.body.classList.remove('fonts-loading');
      document.body.classList.add('fonts-loaded');
      console.debug('Font loading timeout - using fallback fonts');
    }, 3000); // 3 second timeout

    document.fonts.ready.then(() => {
      clearTimeout(fontLoadTimeout);
      document.body.classList.remove('fonts-loading');
      document.body.classList.add('fonts-loaded');
      console.debug('Fonts loaded successfully');
    }).catch(() => {
      clearTimeout(fontLoadTimeout);
      document.body.classList.remove('fonts-loading');
      document.body.classList.add('fonts-loaded');
    });

    // Force font-display: swap on existing stylesheets
    this.forceSwapFontDisplay();
  }

  /**
   * P6-5.3q1: Force font-display swap on all stylesheets
   */
  private forceSwapFontDisplay(): void {
    setTimeout(() => {
      try {
        Array.from(document.styleSheets).forEach(stylesheet => {
          try {
            const rules = stylesheet.cssRules || stylesheet.rules;
            Array.from(rules).forEach(rule => {
              if (rule.type === CSSRule.FONT_FACE_RULE) {
                const fontRule = rule as CSSFontFaceRule;
                (fontRule.style as any).fontDisplay = 'swap';
              }
            });
          } catch (e) {
            // Cross-origin stylesheets - inject override
            const override = document.createElement('style');
            override.textContent = '@font-face { font-display: swap !important; }';
            document.head.appendChild(override);
          }
        });
      } catch (e) {
        console.debug('Could not optimize font display:', e);
      }
    }, 100);
  }

  /**
   * P6-5.3r: Remove unused CSS (simplified)
   */
  private removeUnusedCSS(): void {
    // This is a simplified version - in production, use tools like PurgeCSS
    const unusedSelectors: string[] = [];
    
    // Remove CSS for components not present on current page
    const componentsNotPresent = [
      '.modal:not(.show)',
      '.dropdown:not(.show)',
      '.toast:not(.show)'
    ];

    componentsNotPresent.forEach(selector => {
      if (!document.querySelector(selector.split(':')[0])) {
        unusedSelectors.push(selector);
      }
    });

    // In a real implementation, you would remove these rules from stylesheets
    console.debug('Unused CSS selectors detected:', unusedSelectors);
  }

  /**
   * P6-5.3s: Optimize JavaScript execution - AGGRESSIVE
   */
  private optimizeJavaScript(): void {
    // Immediately implement aggressive JS optimizations
    this.implementAgressiveCodeSplitting();
    this.optimizeBundleLoading();
    this.implementInlineCSS();
    
    // Defer non-critical JavaScript
    const nonCriticalScripts = document.querySelectorAll('script[data-defer]');
    nonCriticalScripts.forEach((script) => {
      const scriptElement = script as HTMLScriptElement;
      scriptElement.defer = true;
    });

    // Use requestIdleCallback for non-urgent tasks
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        this.performNonUrgentOptimizations();
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        this.performNonUrgentOptimizations();
      }, 100); // Reduced timeout for faster execution
    }
  }

  /**
   * P6-5.3s1: Implement aggressive code splitting
   */
  private implementAgressiveCodeSplitting(): void {
    // Remove unused vendor code
    this.removeUnusedVendorCode();
    
    // Implement dynamic imports for heavy components
    this.setupDynamicImports();
    
    // Optimize chunk loading
    this.optimizeChunkLoading();
  }

  /**
   * P6-5.3s2: Remove unused vendor code
   */
  private removeUnusedVendorCode(): void {
    // Identify and remove unused CSS frameworks
    const unusedCSS = [
      'unused-bootstrap',
      'unused-fontawesome',
      'unused-animations'
    ];

    unusedCSS.forEach(className => {
      const elements = document.querySelectorAll(`.${className}`);
      if (elements.length === 0) {
        // Remove associated CSS rules
        this.removeCSSRules(className);
      }
    });
  }

  /**
   * P6-5.3s3: Setup dynamic imports for heavy components
   */
  private setupDynamicImports(): void {
    // Avoid duplicate script injection
    if ((window as any)._vitePreloadOptimized) return;
    (window as any)._vitePreloadOptimized = true;

    // Create a script to handle dynamic imports more efficiently
    const dynamicImportOptimizer = `
      (function() {
        // Override dynamic imports to preload more efficiently
        const originalImport = window.__vitePreload || (() => {});
        window.__vitePreload = (url, deps = []) => {
          // Preload dependencies in parallel
          if (deps && deps.length > 0) {
            deps.forEach(dep => {
              const link = document.createElement('link');
              link.rel = 'modulepreload';
              link.href = dep;
              document.head.appendChild(link);
            });
          }
          return originalImport(url, deps);
        };
      })();
    `;

    const script = document.createElement('script');
    script.textContent = dynamicImportOptimizer;
    document.head.appendChild(script);
  }

  /**
   * P6-5.3s4: Optimize chunk loading
   */
  private optimizeChunkLoading(): void {
    // Preload critical chunks based on current route
    const currentPath = window.location.pathname;
    const criticalChunks = this.getCriticalChunksForRoute(currentPath);
    
    criticalChunks.forEach(chunk => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = chunk;
      document.head.appendChild(link);
    });
  }

  /**
   * P6-5.3s5: Get critical chunks for current route
   */
  private getCriticalChunksForRoute(path: string): string[] {
    const chunkMap: Record<string, string[]> = {
      '/': ['/src/pages/Landing.tsx', '/src/components/analytics/analytics-dashboard.tsx'],
      '/dashboard': ['/src/components/analytics/analytics-dashboard.tsx', '/src/components/create/create-post.tsx'],
      '/automation': ['/src/pages/Automation.tsx', '/src/components/create/create-post.tsx'],
      '/analytics': ['/src/components/analytics/analytics-dashboard.tsx', '/src/components/calendar/calendar-view.tsx']
    };

    return chunkMap[path] || [];
  }

  /**
   * P6-5.3s6: Optimize bundle loading
   */
  private optimizeBundleLoading(): void {
    // Compress and optimize existing scripts
    this.compressInlineScripts();
    
    // Remove duplicate code
    this.removeDuplicateCode();
    
    // Optimize asset loading order
    this.optimizeAssetLoadingOrder();
  }

  /**
   * P6-5.3s7: Compress inline scripts
   */
  private compressInlineScripts(): void {
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach(script => {
      const scriptElement = script as HTMLScriptElement;
      if (scriptElement.textContent && scriptElement.textContent.length > 100) {
        // Minify inline script content
        scriptElement.textContent = scriptElement.textContent
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
          .replace(/\/\/.*$/gm, '') // Remove single line comments
          .replace(/\s+/g, ' ') // Compress whitespace
          .trim();
      }
    });
  }

  /**
   * P6-5.3s8: Remove duplicate code
   */
  private removeDuplicateCode(): void {
    // Track loaded modules to prevent duplicates
    if (!(window as any)._loadedModules) {
      (window as any)._loadedModules = new Set();
    }

    // Override module loading to prevent duplicates
    const originalImport = (window as any).__vitePreload;
    if (originalImport) {
      (window as any).__vitePreload = (url: string, deps: string[] = []) => {
        if ((window as any)._loadedModules.has(url)) {
          return Promise.resolve();
        }
        (window as any)._loadedModules.add(url);
        return originalImport(url, deps);
      };
    }
  }

  /**
   * P6-5.3s9: Optimize asset loading order
   */
  private optimizeAssetLoadingOrder(): void {
    // Reorder assets by priority
    const head = document.head;
    const assets = Array.from(head.children);
    
    // Sort assets by priority (critical CSS first, then preloads, then other resources)
    assets.sort((a, b) => {
      const aPriority = this.getAssetPriority(a);
      const bPriority = this.getAssetPriority(b);
      return bPriority - aPriority; // Higher priority first
    });

    // Reorder in DOM
    assets.forEach(asset => head.appendChild(asset));
  }

  /**
   * P6-5.3s10: Get asset priority for loading order
   */
  private getAssetPriority(element: Element): number {
    const tag = element.tagName.toLowerCase();
    const rel = element.getAttribute('rel');
    const href = element.getAttribute('href') || '';

    // Critical CSS and inline styles have highest priority
    if (tag === 'style') return 100;
    if (tag === 'link' && rel === 'stylesheet' && href.includes('critical')) return 90;
    if (tag === 'link' && rel === 'preload' && element.getAttribute('as') === 'style') return 85;
    
    // Fonts and critical resources
    if (tag === 'link' && rel === 'preload' && element.getAttribute('as') === 'font') return 80;
    if (tag === 'link' && rel === 'preconnect') return 75;
    
    // JavaScript modules
    if (tag === 'link' && rel === 'modulepreload') return 70;
    if (tag === 'script' && element.getAttribute('type') === 'module') return 65;
    
    // Regular stylesheets
    if (tag === 'link' && rel === 'stylesheet') return 60;
    
    // Other preloads
    if (tag === 'link' && rel === 'preload') return 50;
    
    // DNS prefetch and other hints
    if (tag === 'link' && rel === 'dns-prefetch') return 30;
    if (tag === 'link' && rel === 'prefetch') return 20;
    
    // Everything else
    return 10;
  }

  /**
   * P6-5.3s11: Implement inline CSS for critical styles
   */
  private implementInlineCSS(): void {
    // Inline critical CSS directly in head
    const criticalCSS = `
      /* Critical CSS for immediate rendering */
      html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
      .app-loading { display: flex; align-items: center; justify-content: center; height: 100vh; }
      .critical-content { display: block; }
      .non-critical { display: none; }
      
      /* Prevent layout shifts */
      img { width: auto; height: auto; }
      [data-src] { background: #f0f0f0; min-height: 200px; }
      
      /* Fast transitions */
      * { transition: none !important; animation: none !important; }
      .loaded * { transition: all 0.2s ease; }
    `;

    const style = document.createElement('style');
    style.setAttribute('data-critical', 'true');
    style.textContent = criticalCSS;
    document.head.insertBefore(style, document.head.firstChild);

    // Enable transitions after load
    window.addEventListener('load', () => {
      document.body.classList.add('loaded');
    });
  }

  /**
   * P6-5.3s12: Remove CSS rules for unused selectors
   */
  private removeCSSRules(selector: string): void {
    try {
      Array.from(document.styleSheets).forEach(stylesheet => {
        try {
          const rules = stylesheet.cssRules || stylesheet.rules;
          for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i] as CSSStyleRule;
            if (rule.selectorText && rule.selectorText.includes(selector)) {
              stylesheet.deleteRule(i);
            }
          }
        } catch (e) {
          // Cross-origin or protected stylesheet
          console.debug('Could not modify stylesheet:', e);
        }
      });
    } catch (e) {
      console.debug('CSS optimization error:', e);
    }
  }

  /**
   * P6-5.3t: Perform non-urgent optimizations
   */
  private performNonUrgentOptimizations(): void {
    // Preload critical resources for next navigation
    this.preloadCriticalResources();
    
    // Clean up memory
    this.performMemoryCleanup();
    
    // Report performance metrics
    this.reportPerformanceMetrics();
  }

  /**
   * P6-5.4: Performance monitoring and reporting
   */
  private reportWebVital(name: string, value: number): void {
    // Send to analytics service
    console.debug(`Web Vital - ${name}: ${value.toFixed(2)}ms`);
    
    // Emit custom event
    window.dispatchEvent(new CustomEvent('webvital', {
      detail: { name, value }
    }));
  }

  private reportPerformanceMetrics(): void {
    const metrics = this.getPerformanceMetrics();
    
    // Send to analytics
    console.debug('Performance Metrics:', metrics);
    
    // Emit event
    window.dispatchEvent(new CustomEvent('performancemetrics', {
      detail: metrics
    }));
  }

  /**
   * P6-5.5: Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    return {
      pageLoadTime: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0,
      resourcesLoaded: performance.getEntriesByType('resource').length,
      memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
      connectionType: (navigator as any).connection?.effectiveType || 'unknown',
      deviceType: this.getDeviceType(),
      performanceScore: this.calculatePerformanceScore()
    };
  }

  /**
   * P6-5.6: Calculate performance score
   */
  private calculatePerformanceScore(): number {
    const { lcp = 0, fid = 0, cls = 0, fcp = 0 } = this.webVitals;
    
    // Simple scoring based on Web Vitals thresholds
    let score = 100;
    
    if (lcp > 2500) score -= 25;
    else if (lcp > 4000) score -= 50;
    
    if (fid > 100) score -= 25;
    else if (fid > 300) score -= 50;
    
    if (cls > 0.1) score -= 25;
    else if (cls > 0.25) score -= 50;
    
    if (fcp > 1800) score -= 15;
    else if (fcp > 3000) score -= 30;
    
    return Math.max(0, score);
  }

  private getDeviceType(): string {
    if (/Mobi|Android/i.test(navigator.userAgent)) return 'mobile';
    if (/Tablet|iPad/i.test(navigator.userAgent)) return 'tablet';
    return 'desktop';
  }

  /**
   * P6-5.7: Memory management
   */
  private performMemoryCleanup(): void {
    // Clear prefetched resources that haven't been used
    this.prefetchedResources.clear();
    
    // Remove unused lazy images from tracking
    this.lazyImages.forEach(img => {
      if (!document.contains(img)) {
        this.lazyImages.delete(img);
      }
    });
  }

  private preloadCriticalResources(): void {
    // Preload critical resources for likely next pages
    const criticalResources = [
      '/dashboard',
      '/automation',
      '/analytics'
    ];

    criticalResources.forEach(resource => {
      if (!this.prefetchedResources.has(resource)) {
        this.prefetchResource(resource);
      }
    });
  }

  /**
   * P6-5.8: Public API methods
   */
  getWebVitals(): Partial<WebVitals> {
    return { ...this.webVitals };
  }

  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * P6-5.9: Cleanup method
   */
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.lazyImages.clear();
    this.prefetchedResources.clear();
  }
}

/**
 * P6-5.10: React hooks for performance optimization
 */
import { useEffect, useState } from 'react';

export function usePerformance() {
  const performanceOptimizer = FrontendPerformanceOptimizer.getInstance();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [webVitals, setWebVitals] = useState<Partial<WebVitals>>({});

  useEffect(() => {
    const handleWebVital = (event: CustomEvent) => {
      setWebVitals(prev => ({
        ...prev,
        [event.detail.name.toLowerCase()]: event.detail.value
      }));
    };

    const handleMetrics = (event: CustomEvent) => {
      setMetrics(event.detail);
    };

    window.addEventListener('webvital', handleWebVital as EventListener);
    window.addEventListener('performancemetrics', handleMetrics as EventListener);

    return () => {
      window.removeEventListener('webvital', handleWebVital as EventListener);
      window.removeEventListener('performancemetrics', handleMetrics as EventListener);
    };
  }, []);

  return {
    metrics,
    webVitals,
    getMetrics: () => performanceOptimizer.getPerformanceMetrics(),
    getWebVitals: () => performanceOptimizer.getWebVitals()
  };
}

export function useLazyImage(src: string, _options?: { threshold?: number }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setError(true);
    img.src = src;
  }, [src]);

  return { loaded, error, src: loaded ? src : undefined };
}

/**
 * P6-5.11: Image component with optimization
 */
import React, { forwardRef } from 'react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  lazy?: boolean;
  quality?: number;
  sizes?: string;
}

export const OptimizedImage = forwardRef<HTMLImageElement, OptimizedImageProps>(
  ({ src, alt, lazy = true, quality = 80, sizes, className, ...props }, ref) => {
    const optimizedSrc = lazy ? undefined : src;
    const dataSrc = lazy ? src : undefined;

    return (
      <img
        ref={ref}
        src={optimizedSrc}
        data-src={dataSrc}
        alt={alt}
        className={`${className || ''} ${lazy ? 'lazy' : ''}`}
        loading={lazy ? 'lazy' : 'eager'}
        sizes={sizes}
        {...props}
      />
    );
  }
);

OptimizedImage.displayName = 'OptimizedImage';

/**
 * P6-5.12: Initialize frontend performance optimization
 */
export function initializeFrontendPerformance(config?: Partial<PerformanceConfig>): void {
  const performanceOptimizer = FrontendPerformanceOptimizer.getInstance();
  performanceOptimizer.initialize(config);
}
