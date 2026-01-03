/**
 * P11: MOBILE PERFORMANCE OPTIMIZATION SYSTEM
 * Advanced mobile-specific performance enhancements
 */

// Mobile performance metrics and optimization
export class MobilePerformance {
  private static instance: MobilePerformance;
  private performanceObserver: PerformanceObserver | null = null;
  private networkInfo: NetworkInformation | null = null;
  private batteryManager: any = null;
  private isLowPowerMode = false;

  static getInstance(): MobilePerformance {
    if (!MobilePerformance.instance) {
      MobilePerformance.instance = new MobilePerformance();
    }
    return MobilePerformance.instance;
  }

  /**
   * Initialize mobile performance optimization
   */
  async initialize(): Promise<void> {
    await this.setupNetworkDetection();
    await this.setupBatteryMonitoring();
    this.setupPerformanceMonitoring();
    this.setupAdaptiveLoading();
    this.setupImageOptimization();
    this.setupMemoryManagement();

    console.log('📊 P11: Mobile performance optimization initialized');
  }

  /**
   * Setup network connection detection
   */
  private async setupNetworkDetection(): Promise<void> {
    // Modern Network Information API
    if ('connection' in navigator) {
      this.networkInfo = (navigator as any).connection;

      this.networkInfo?.addEventListener('change', () => {
        this.handleNetworkChange();
      });

      this.handleNetworkChange();
    }

    // Fallback: Online/offline detection
    window.addEventListener('online', () => {
      this.applyNetworkOptimizations('online');
    });

    window.addEventListener('offline', () => {
      this.applyNetworkOptimizations('offline');
    });
  }

  /**
   * Handle network connection changes
   */
  private handleNetworkChange(): void {
    if (!this.networkInfo) return;

    const { effectiveType, downlink, rtt, saveData } = this.networkInfo;

    console.log('📡 P11: Network changed:', {
      effectiveType,
      downlink: `${downlink}Mbps`,
      rtt: `${rtt}ms`,
      saveData
    });

    // Apply optimizations based on network conditions
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || saveData) {
      this.enableDataSaverMode();
    } else if (effectiveType === '3g') {
      this.enableMediumQualityMode();
    } else {
      this.enableHighQualityMode();
    }
  }

  /**
   * Setup battery monitoring
   */
  private async setupBatteryMonitoring(): Promise<void> {
    try {
      // Battery Status API
      if ('getBattery' in navigator) {
        this.batteryManager = await (navigator as any).getBattery();

        const checkBatteryStatus = () => {
          const { level, charging } = this.batteryManager;
          const lowBattery = level < 0.2 && !charging;

          if (lowBattery !== this.isLowPowerMode) {
            this.isLowPowerMode = lowBattery;
            this.handleBatteryChange(lowBattery);
          }
        };

        this.batteryManager.addEventListener('levelchange', checkBatteryStatus);
        this.batteryManager.addEventListener('chargingchange', checkBatteryStatus);

        checkBatteryStatus();
      }
    } catch (error) {
      console.log('📱 P11: Battery API not available');
    }
  }

  /**
   * Handle battery level changes
   */
  private handleBatteryChange(isLowPower: boolean): void {
    console.log(`🔋 P11: Battery mode changed - Low power: ${isLowPower}`);

    if (isLowPower) {
      this.enablePowerSavingMode();
    } else {
      this.disablePowerSavingMode();
    }
  }

  /**
   * Setup performance monitoring for mobile
   */
  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.analyzePerformanceEntry(entry);
          }
        });

        // Observe various performance metrics
        this.performanceObserver.observe({ entryTypes: ['navigation', 'resource', 'paint', 'largest-contentful-paint'] });
      } catch (error) {
        console.log('📊 P11: Performance Observer setup failed');
      }
    }

    // Monitor FPS for smooth scrolling
    this.monitorFPS();

    // Monitor memory usage
    this.monitorMemoryUsage();
  }

  /**
   * Analyze performance entries
   */
  private analyzePerformanceEntry(entry: PerformanceEntry): void {
    if (entry.entryType === 'largest-contentful-paint') {
      const lcp = entry.startTime;
      console.log(`🎯 P11: LCP = ${lcp.toFixed(2)}ms`);

      // If LCP is too high on mobile, apply optimizations
      if (lcp > 2500) {
        this.applyLCPOptimizations();
      }
    }

    if (entry.entryType === 'resource') {
      const resource = entry as PerformanceResourceTiming;

      // Monitor large resources on mobile
      if (resource.transferSize && resource.transferSize > 100 * 1024) { // >100KB
        console.log(`📦 P11: Large resource detected: ${resource.name} (${(resource.transferSize / 1024).toFixed(2)}KB)`);
      }
    }
  }

  /**
   * Monitor FPS for smooth animations
   */
  private monitorFPS(): void {
    let frames = 0;
    let lastTime = performance.now();

    const measureFPS = () => {
      frames++;
      const currentTime = performance.now();

      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastTime));

        // If FPS drops below 30 on mobile, reduce animations
        if (fps < 30) {
          this.reduceAnimations();
        }

        frames = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * Monitor memory usage
   */
  private monitorMemoryUsage(): void {
    const checkMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

        // If memory usage is high, trigger garbage collection optimizations
        if (memoryUsage > 0.8) {
          this.optimizeMemoryUsage();
        }
      }
    };

    // Check memory every 30 seconds
    setInterval(checkMemory, 30000);
    checkMemory();
  }

  /**
   * Setup adaptive loading based on device capabilities
   */
  private setupAdaptiveLoading(): void {
    const deviceMemory = (navigator as any).deviceMemory || 4; // Default to 4GB
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;

    // Classify device performance
    let deviceTier: 'low' | 'medium' | 'high' = 'medium';

    if (deviceMemory <= 2 || hardwareConcurrency <= 2) {
      deviceTier = 'low';
    } else if (deviceMemory >= 8 && hardwareConcurrency >= 8) {
      deviceTier = 'high';
    }

    console.log(`📱 P11: Device tier: ${deviceTier} (RAM: ${deviceMemory}GB, Cores: ${hardwareConcurrency})`);

    // Apply device-specific optimizations
    this.applyDeviceTierOptimizations(deviceTier);
  }

  /**
   * Apply device tier optimizations
   */
  private applyDeviceTierOptimizations(tier: 'low' | 'medium' | 'high'): void {
    const root = document.documentElement;

    switch (tier) {
      case 'low':
        root.classList.add('low-end-device');
        this.enableLowEndOptimizations();
        break;
      case 'high':
        root.classList.add('high-end-device');
        this.enableHighEndFeatures();
        break;
      default:
        root.classList.add('medium-end-device');
        break;
    }
  }

  /**
   * Enable low-end device optimizations
   */
  private enableLowEndOptimizations(): void {
    const style = document.createElement('style');
    style.textContent = `
      .low-end-device * {
        will-change: auto !important;
      }
      
      .low-end-device .animate-float,
      .low-end-device .animate-pulse,
      .low-end-device .animate-shimmer {
        animation: none !important;
      }
      
      .low-end-device .backdrop-blur {
        backdrop-filter: none !important;
      }
      
      .low-end-device img {
        image-rendering: -webkit-optimize-contrast;
      }
    `;
    document.head.appendChild(style);

    console.log('⚡ P11: Low-end device optimizations enabled');
  }

  /**
   * Enable high-end device features
   */
  private enableHighEndFeatures(): void {
    const style = document.createElement('style');
    style.textContent = `
      .high-end-device {
        --animation-duration: 0.3s;
        --blur-strength: 20px;
      }
      
      .high-end-device .backdrop-blur {
        backdrop-filter: blur(var(--blur-strength));
      }
      
      .high-end-device .smooth-scroll {
        scroll-behavior: smooth;
      }
    `;
    document.head.appendChild(style);

    console.log('✨ P11: High-end device features enabled');
  }

  /**
   * Setup memory management for mobile devices
   */
  private setupMemoryManagement(): void {
    // Monitor memory usage and apply optimizations
    this.monitorMemoryUsage();

    // Setup memory pressure handling
    if ('memory' in performance) {
      const memory = (performance as any).memory;

      // Check memory every 10 seconds
      setInterval(() => {
        const memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

        if (memoryUsage > 0.7) {
          console.log('🧠 P11: High memory usage detected, applying optimizations');
          this.optimizeMemoryUsage();
        }
      }, 10000);
    }

    // Setup page visibility API for memory cleanup
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page is hidden, cleanup memory
        this.cleanupEventListeners();
        this.unloadOffScreenImages();
      }
    });

    console.log('🧠 P11: Memory management setup completed');
  }

  /**
   * Setup image optimization for mobile
   */
  private setupImageOptimization(): void {
    // Use Intersection Observer for lazy loading
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target as HTMLImageElement;
              this.optimizeImageForMobile(img);
              imageObserver.unobserve(img);
            }
          });
        },
        { rootMargin: '50px' }
      );

      // Observe all images
      document.querySelectorAll('img[data-src]').forEach((img) => {
        imageObserver.observe(img);
      });
    }
  }

  /**
   * Optimize individual images for mobile
   */
  private optimizeImageForMobile(img: HTMLImageElement): void {
    const dataSrc = img.dataset.src;
    if (!dataSrc) return;

    // Choose appropriate image format based on support
    let optimizedSrc = dataSrc;

    // Check for WebP support
    if (this.supportsWebP() && dataSrc.includes('.jpg') || dataSrc.includes('.jpeg')) {
      optimizedSrc = dataSrc.replace(/\.(jpg|jpeg)/, '.webp');
    }

    // Adjust image size based on device pixel ratio and screen size
    const dpr = window.devicePixelRatio || 1;
    const screenWidth = window.screen.width;

    // Add size parameters for responsive images
    if (optimizedSrc.includes('?')) {
      optimizedSrc += `&w=${Math.round(screenWidth * dpr)}&dpr=${dpr}`;
    } else {
      optimizedSrc += `?w=${Math.round(screenWidth * dpr)}&dpr=${dpr}`;
    }

    img.src = optimizedSrc;
  }

  /**
   * Check WebP support
   */
  private supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
  }

  /**
   * Network-specific optimizations
   */
  private enableDataSaverMode(): void {
    console.log('📶 P11: Data saver mode enabled');

    const style = document.createElement('style');
    style.textContent = `
      .data-saver img {
        filter: blur(2px);
        transition: filter 0.3s;
      }
      
      .data-saver img:hover {
        filter: none;
      }
      
      .data-saver video {
        display: none;
      }
      
      .data-saver .auto-play {
        display: none;
      }
    `;
    document.head.appendChild(style);

    document.body.classList.add('data-saver');
  }

  private enableMediumQualityMode(): void {
    console.log('📶 P11: Medium quality mode enabled');
    document.body.classList.remove('data-saver', 'high-quality');
    document.body.classList.add('medium-quality');
  }

  private enableHighQualityMode(): void {
    console.log('📶 P11: High quality mode enabled');
    document.body.classList.remove('data-saver', 'medium-quality');
    document.body.classList.add('high-quality');
  }

  /**
   * Battery-specific optimizations
   */
  private enablePowerSavingMode(): void {
    console.log('🔋 P11: Power saving mode enabled');

    const style = document.createElement('style');
    style.textContent = `
      .power-saving * {
        animation-duration: 0.1s !important;
        transition-duration: 0.1s !important;
      }
      
      .power-saving .backdrop-blur {
        backdrop-filter: none !important;
      }
      
      .power-saving .animate-pulse,
      .power-saving .animate-shimmer {
        animation: none !important;
      }
    `;
    document.head.appendChild(style);

    document.body.classList.add('power-saving');
  }

  private disablePowerSavingMode(): void {
    console.log('🔋 P11: Power saving mode disabled');
    document.body.classList.remove('power-saving');
  }

  /**
   * Performance optimization methods
   */
  private applyLCPOptimizations(): void {
    console.log('🎯 P11: Applying LCP optimizations');

    // Preload critical resources
    const criticalImages = document.querySelectorAll('img[data-critical]');
    criticalImages.forEach((img) => {
      const src = (img as HTMLImageElement).src || img.getAttribute('data-src');
      if (src) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
      }
    });
  }

  private reduceAnimations(): void {
    console.log('🎭 P11: Reducing animations for better performance');

    const style = document.createElement('style');
    style.textContent = `
      .reduced-animations * {
        animation-duration: 0.2s !important;
        transition-duration: 0.2s !important;
      }
    `;
    document.head.appendChild(style);

    document.body.classList.add('reduced-animations');
  }

  private optimizeMemoryUsage(): void {
    console.log('🧠 P11: Optimizing memory usage');

    // Remove unused event listeners
    this.cleanupEventListeners();

    // Unload off-screen images
    this.unloadOffScreenImages();

    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }
  }

  /**
   * Cleanup methods
   */
  private cleanupEventListeners(): void {
    // Remove listeners from elements no longer in the DOM
    const elements = document.querySelectorAll('[data-has-listeners]');
    elements.forEach((element) => {
      if (!document.contains(element)) {
        // Element is no longer in DOM, cleanup would happen here
        console.log('🧹 P11: Cleaning up orphaned element listeners');
      }
    });
  }

  private unloadOffScreenImages(): void {
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      const rect = img.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (!isVisible && img.src && !img.dataset.src) {
        // Move src to data-src and clear src to free memory
        img.dataset.src = img.src;
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      }
    });
  }

  /**
   * Network optimization methods
   */
  private applyNetworkOptimizations(status: 'online' | 'offline'): void {
    if (status === 'offline') {
      console.log('📱 P11: Offline mode - enabling offline optimizations');
      document.body.classList.add('offline');
    } else {
      console.log('📱 P11: Online mode - enabling online features');
      document.body.classList.remove('offline');
    }
  }

  /**
   * Public API
   */
  getNetworkInfo(): NetworkInformation | null {
    return this.networkInfo;
  }

  getBatteryInfo(): any {
    return this.batteryManager;
  }

  isInDataSaverMode(): boolean {
    return document.body.classList.contains('data-saver');
  }

  isInPowerSavingMode(): boolean {
    return this.isLowPowerMode;
  }

  /**
   * Manual optimization triggers
   */
  optimizeForSlowNetwork(): void {
    this.enableDataSaverMode();
  }

  optimizeForLowBattery(): void {
    this.enablePowerSavingMode();
  }

  optimizeForLowEndDevice(): void {
    this.enableLowEndOptimizations();
  }
}

// Initialize mobile performance optimization
export function initializeMobilePerformance(): void {
  const performance = MobilePerformance.getInstance();
  performance.initialize();

  console.log('📱 P11: Mobile performance optimization system initialized');
}

// Network Information API types
interface NetworkInformation extends EventTarget {
  readonly downlink: number;
  readonly effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  readonly rtt: number;
  readonly saveData: boolean;
}