/**
 * P11: CROSS-BROWSER COMPATIBILITY SYSTEM
 * Ensuring seamless experience across Chrome, Firefox, Safari, and Edge
 */

// Browser detection and compatibility checking
export class BrowserCompatibility {
  private static instance: BrowserCompatibility;
  private browserInfo: BrowserInfo | null = null;

  static getInstance(): BrowserCompatibility {
    if (!BrowserCompatibility.instance) {
      BrowserCompatibility.instance = new BrowserCompatibility();
    }
    return BrowserCompatibility.instance;
  }

  /**
   * Initialize cross-browser compatibility system
   */
  initialize(): void {
    this.detectBrowser();
    this.applyBrowserSpecificFixes();
    this.setupFeatureDetection();
    this.addBrowserClasses();
    
    console.log('🌐 P11: Cross-browser compatibility system initialized');
  }

  /**
   * Detect browser and version
   */
  private detectBrowser(): void {
    const userAgent = navigator.userAgent;
    let browser = 'unknown';
    let version = '0';
    let engine = 'unknown';

    // Chrome detection
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browser = 'chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      version = match ? match[1] : '0';
      engine = 'blink';
    }
    // Firefox detection
    else if (userAgent.includes('Firefox')) {
      browser = 'firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      version = match ? match[1] : '0';
      engine = 'gecko';
    }
    // Safari detection
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'safari';
      const match = userAgent.match(/Version\/(\d+)/);
      version = match ? match[1] : '0';
      engine = 'webkit';
    }
    // Edge detection
    else if (userAgent.includes('Edg')) {
      browser = 'edge';
      const match = userAgent.match(/Edg\/(\d+)/);
      version = match ? match[1] : '0';
      engine = 'blink';
    }

    this.browserInfo = {
      browser,
      version: parseInt(version),
      engine,
      userAgent,
      isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent),
      isIOS: /iPad|iPhone|iPod/.test(userAgent),
      isAndroid: /Android/.test(userAgent)
    };
  }

  /**
   * Apply browser-specific fixes and optimizations
   */
  private applyBrowserSpecificFixes(): void {
    if (!this.browserInfo) return;

    const { browser, engine, isIOS, isAndroid } = this.browserInfo;

    // Safari-specific fixes
    if (browser === 'safari') {
      this.applySafariFixes();
    }

    // Firefox-specific fixes
    if (browser === 'firefox') {
      this.applyFirefoxFixes();
    }

    // Chrome-specific optimizations
    if (browser === 'chrome') {
      this.applyChromeFixes();
    }

    // Edge-specific fixes
    if (browser === 'edge') {
      this.applyEdgeFixes();
    }

    // iOS-specific fixes
    if (isIOS) {
      this.applyIOSFixes();
    }

    // Android-specific fixes
    if (isAndroid) {
      this.applyAndroidFixes();
    }

    // Engine-specific optimizations
    if (engine === 'webkit') {
      this.applyWebkitOptimizations();
    }
  }

  /**
   * Safari-specific fixes
   */
  private applySafariFixes(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Safari zoom fix */
      input, textarea, select {
        font-size: 16px !important;
      }
      
      /* Safari viewport height fix */
      .full-height-safari {
        height: 100vh;
        height: -webkit-fill-available;
      }
      
      /* Safari backdrop-filter performance */
      .backdrop-blur-safari {
        -webkit-backdrop-filter: blur(20px);
        backdrop-filter: blur(20px);
      }
      
      /* Safari smooth scrolling */
      html {
        -webkit-overflow-scrolling: touch;
      }
      
      /* Safari input appearance */
      input[type="search"] {
        -webkit-appearance: none;
        appearance: none;
      }
    `;
    document.head.appendChild(style);

    // Safari-specific JavaScript fixes
    if ('serviceWorker' in navigator) {
      // Delayed service worker registration for Safari
      setTimeout(() => {
        navigator.serviceWorker.register('/sw.js');
      }, 1000);
    }
  }

  /**
   * Firefox-specific fixes
   */
  private applyFirefoxFixes(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Firefox scrollbar styling */
      html {
        scrollbar-width: thin;
        scrollbar-color: rgba(139, 92, 246, 0.5) rgba(0, 0, 0, 0.1);
      }
      
      /* Firefox focus outline */
      button::-moz-focus-inner {
        border: 0;
      }
      
      /* Firefox input styling */
      input[type="number"] {
        -moz-appearance: textfield;
      }
      
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Chrome-specific optimizations
   */
  private applyChromeFixes(): void {
    // Chrome performance optimizations
    if (this.browserInfo?.version && this.browserInfo.version >= 88) {
      // Enable modern Chrome features
      document.documentElement.style.setProperty('--chrome-optimized', '1');
    }

    const style = document.createElement('style');
    style.textContent = `
      /* Chrome autofill styling */
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        -webkit-text-fill-color: inherit !important;
        -webkit-box-shadow: 0 0 0 30px transparent inset !important;
        transition: background-color 5000s ease-in-out 0s;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Edge-specific fixes
   */
  private applyEdgeFixes(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Edge compatibility fixes */
      .edge-grid-fix {
        display: -ms-grid;
        display: grid;
      }
      
      /* Edge flexbox fixes */
      .edge-flex-fix {
        display: -ms-flexbox;
        display: flex;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * iOS-specific fixes
   */
  private applyIOSFixes(): void {
    // iOS viewport fix
    const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    if (viewportMeta) {
      viewportMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    }

    // iOS scroll fix
    document.body.style.setProperty('-webkit-overflow-scrolling', 'touch');

    // iOS input zoom prevention
    const style = document.createElement('style');
    style.textContent = `
      @media screen and (max-device-width: 480px) {
        input, textarea, select {
          font-size: 16px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Android-specific fixes
   */
  private applyAndroidFixes(): void {
    // Android viewport optimization
    const style = document.createElement('style');
    style.textContent = `
      /* Android-specific optimizations */
      .android-tap-highlight {
        -webkit-tap-highlight-color: transparent;
      }
      
      /* Android input focus */
      input:focus {
        outline: 2px solid #4f46e5;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);

    // Android keyboard handling
    window.addEventListener('resize', () => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        setTimeout(() => {
          document.activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
  }

  /**
   * WebKit engine optimizations
   */
  private applyWebkitOptimizations(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* WebKit optimizations */
      .webkit-optimize {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-backface-visibility: hidden;
        backface-visibility: hidden;
      }
      
      /* WebKit scroll momentum */
      .webkit-momentum-scroll {
        -webkit-overflow-scrolling: touch;
        overflow-scrolling: touch;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Feature detection and polyfills
   */
  private setupFeatureDetection(): void {
    const features = {
      intersectionObserver: 'IntersectionObserver' in window,
      resizeObserver: 'ResizeObserver' in window,
      serviceWorker: 'serviceWorker' in navigator,
      webp: this.supportsWebP(),
      avif: this.supportsAVIF(),
      customElements: 'customElements' in window,
      cssGrid: this.supportsCSSGrid(),
      cssVariables: this.supportsCSSVariables(),
      ES2017: this.supportsES2017(),
      touchEvents: 'ontouchstart' in window,
      pointerEvents: 'PointerEvent' in window
    };

    // Store feature detection results
    (window as any).browserFeatures = features;

    // Apply polyfills where needed
    this.applyPolyfills(features);

    console.log('🔍 P11: Feature detection completed:', features);
  }

  /**
   * Apply polyfills for missing features
   */
  private applyPolyfills(features: Record<string, boolean>): void {
    // Intersection Observer polyfill
    if (!features.intersectionObserver) {
      this.loadPolyfill('https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver');
    }

    // Resize Observer polyfill
    if (!features.resizeObserver) {
      this.loadPolyfill('https://polyfill.io/v3/polyfill.min.js?features=ResizeObserver');
    }

    // CSS Variables polyfill for older browsers
    if (!features.cssVariables) {
      this.loadPolyfill('https://polyfill.io/v3/polyfill.min.js?features=css-variables');
    }
  }

  /**
   * Load polyfill script
   */
  private loadPolyfill(src: string): void {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
  }

  /**
   * Add browser-specific classes to document
   */
  private addBrowserClasses(): void {
    if (!this.browserInfo) return;

    const { browser, engine, isMobile, isIOS, isAndroid } = this.browserInfo;
    const classes = [
      `browser-${browser}`,
      `engine-${engine}`,
      isMobile ? 'is-mobile' : 'is-desktop',
      isIOS ? 'is-ios' : '',
      isAndroid ? 'is-android' : ''
    ].filter(Boolean);

    document.documentElement.classList.add(...classes);
  }

  /**
   * Feature detection methods
   */
  private supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
  }

  private supportsAVIF(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/avif').indexOf('image/avif') === 5;
  }

  private supportsCSSGrid(): boolean {
    return CSS.supports('display', 'grid');
  }

  private supportsCSSVariables(): boolean {
    return CSS.supports('--fake-var', '0');
  }

  private supportsES2017(): boolean {
    try {
      return typeof Symbol.asyncIterator === 'symbol';
    } catch {
      return false;
    }
  }

  /**
   * Get browser information
   */
  getBrowserInfo(): BrowserInfo | null {
    return this.browserInfo;
  }

  /**
   * Check if specific feature is supported
   */
  supportsFeature(feature: string): boolean {
    return (window as any).browserFeatures?.[feature] ?? false;
  }
}

// Browser information interface
interface BrowserInfo {
  browser: string;
  version: number;
  engine: string;
  userAgent: string;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

// Cross-browser event handling
export class CrossBrowserEvents {
  /**
   * Add event listener with cross-browser compatibility
   */
  static addEventListener(
    element: Element | Window | Document,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    // Modern browsers
    if (element.addEventListener) {
      element.addEventListener(event, handler, options);
    }
    // Legacy IE support (if needed)
    else if ((element as any).attachEvent) {
      (element as any).attachEvent(`on${event}`, handler);
    }
  }

  /**
   * Remove event listener with cross-browser compatibility
   */
  static removeEventListener(
    element: Element | Window | Document,
    event: string,
    handler: EventListener,
    options?: EventListenerOptions
  ): void {
    if (element.removeEventListener) {
      element.removeEventListener(event, handler, options);
    } else if ((element as any).detachEvent) {
      (element as any).detachEvent(`on${event}`, handler);
    }
  }

  /**
   * Cross-browser touch and mouse event handling
   */
  static addPointerEvent(
    element: Element,
    callback: (e: TouchEvent | MouseEvent | PointerEvent) => void
  ): void {
    // Pointer Events (modern)
    if ('PointerEvent' in window) {
      element.addEventListener('pointerdown', callback as EventListener);
      element.addEventListener('pointermove', callback as EventListener);
      element.addEventListener('pointerup', callback as EventListener);
    }
    // Touch Events (mobile)
    else if ('ontouchstart' in window) {
      element.addEventListener('touchstart', callback as EventListener);
      element.addEventListener('touchmove', callback as EventListener);
      element.addEventListener('touchend', callback as EventListener);
    }
    // Mouse Events (desktop fallback)
    else {
      element.addEventListener('mousedown', callback as EventListener);
      element.addEventListener('mousemove', callback as EventListener);
      element.addEventListener('mouseup', callback as EventListener);
    }
  }
}

// Initialize cross-browser compatibility
export function initializeCrossBrowserCompatibility(): void {
  const compatibility = BrowserCompatibility.getInstance();
  compatibility.initialize();
  
  console.log('🌐 P11: Cross-browser compatibility system fully initialized');
}