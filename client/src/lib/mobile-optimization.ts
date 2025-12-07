/**
 * P6-4: Mobile Responsiveness Optimization
 * 
 * Production-grade mobile optimization with responsive design,
 * touch interactions, device detection, and mobile-specific features
 */

/**
 * P6-4.1: Mobile optimization configuration
 */
export interface MobileConfig {
  enableTouchOptimization: boolean;
  enableGestureSupport: boolean;
  enableMobileMenus: boolean;
  enablePullToRefresh: boolean;
  enableSwipeNavigation: boolean;
  touchDelayReduction: boolean;
  orientationHandling: boolean;
  viewport: {
    width: string;
    scale: string;
    userScalable: boolean;
  };
}

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: 'portrait' | 'landscape';
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  touchSupport: boolean;
  pixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface TouchGesture {
  type: 'tap' | 'swipe' | 'pinch' | 'rotate' | 'pan';
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  velocity?: number;
  scale?: number;
  rotation?: number;
}

/**
 * P6-4.2: Default mobile configuration
 */
export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
  enableTouchOptimization: true,
  enableGestureSupport: true,
  enableMobileMenus: true,
  enablePullToRefresh: true,
  enableSwipeNavigation: true,
  touchDelayReduction: true,
  orientationHandling: true,
  viewport: {
    width: 'device-width',
    scale: '1.0',
    userScalable: false
  }
};

/**
 * P6-4.3: Mobile optimization manager
 */
export class MobileOptimizer {
  private static instance: MobileOptimizer;
  private config: MobileConfig = DEFAULT_MOBILE_CONFIG;
  private deviceInfo: DeviceInfo;
  private gestureHandlers = new Map<string, (gesture: TouchGesture) => void>();
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private lastTouchEnd = 0;

  static getInstance(): MobileOptimizer {
    if (!MobileOptimizer.instance) {
      MobileOptimizer.instance = new MobileOptimizer();
    }
    return MobileOptimizer.instance;
  }

  /**
   * P6-4.3a: Initialize mobile optimization
   */
  initialize(config?: Partial<MobileConfig>): void {
    this.config = { ...DEFAULT_MOBILE_CONFIG, ...config };
    this.deviceInfo = this.detectDevice();
    
    this.setupViewport();
    this.setupTouchOptimization();
    this.setupGestureSupport();
    this.setupOrientationHandling();
    this.setupMobileCSS();
    this.preventZoom();
    
    console.log('📱 P6-4: Mobile optimization system initialized', this.deviceInfo);
  }

  /**
   * P6-4.3b: Device detection
   */
  private detectDevice(): DeviceInfo {
    const userAgent = navigator.userAgent.toLowerCase();
    const screenWidth = window.screen.width;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Device type detection
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
                    (screenWidth <= 768 && 'ontouchstart' in window);
    const isTablet = /ipad|android(?=.*tablet)|tablet/i.test(userAgent) ||
                    (screenWidth > 768 && screenWidth <= 1024 && 'ontouchstart' in window);
    const isDesktop = !isMobile && !isTablet;

    // Screen size classification
    let screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
    if (viewportWidth < 576) screenSize = 'xs';
    else if (viewportWidth < 768) screenSize = 'sm';
    else if (viewportWidth < 992) screenSize = 'md';
    else if (viewportWidth < 1200) screenSize = 'lg';
    else screenSize = 'xl';

    // Orientation detection
    const orientation = viewportHeight > viewportWidth ? 'portrait' : 'landscape';

    return {
      isMobile,
      isTablet,
      isDesktop,
      orientation,
      screenSize,
      touchSupport: 'ontouchstart' in window,
      pixelRatio: window.devicePixelRatio || 1,
      viewportWidth,
      viewportHeight
    };
  }

  /**
   * P6-4.3c: Setup viewport meta tag
   */
  private setupViewport(): void {
    let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }

    const { width, scale, userScalable } = this.config.viewport;
    viewport.content = `width=${width}, initial-scale=${scale}, maximum-scale=${scale}, minimum-scale=${scale}, user-scalable=${userScalable ? 'yes' : 'no'}`;
  }

  /**
   * P6-4.3d: Setup touch optimization
   */
  private setupTouchOptimization(): void {
    if (!this.config.enableTouchOptimization || !this.deviceInfo.touchSupport) return;

    // Reduce touch delay (300ms click delay)
    if (this.config.touchDelayReduction) {
      document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
      document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    }

    // Add touch-friendly CSS classes
    document.body.classList.add('touch-device');
    if (this.deviceInfo.isMobile) document.body.classList.add('mobile-device');
    if (this.deviceInfo.isTablet) document.body.classList.add('tablet-device');

    // Optimize button sizes for touch
    this.optimizeTouchTargets();
  }

  /**
   * P6-4.3e: Handle touch events for optimization
   */
  private handleTouchStart(e: TouchEvent): void {
    this.touchStartTime = Date.now();
    const touch = e.touches[0];
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
  }

  private handleTouchEnd(e: TouchEvent): void {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;
    const timeSinceLastTouch = touchEndTime - this.lastTouchEnd;

    // Fast tap detection (avoid 300ms delay)
    if (touchDuration < 150 && timeSinceLastTouch > 300) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'BUTTON' || target.closest('button, a, [role="button"]'))) {
        // Prevent the delayed click
        e.preventDefault();
        // Trigger immediate click
        target.click();
      }
    }

    this.lastTouchEnd = touchEndTime;
  }

  /**
   * P6-4.3f: Optimize touch targets
   */
  private optimizeTouchTargets(): void {
    const minTouchSize = 44; // 44px minimum touch target (Apple HIG)
    
    document.querySelectorAll('button, a, input[type="button"], input[type="submit"]')
      .forEach((element) => {
        const el = element as HTMLElement;
        const rect = el.getBoundingClientRect();
        
        if (rect.width < minTouchSize || rect.height < minTouchSize) {
          el.style.minWidth = `${minTouchSize}px`;
          el.style.minHeight = `${minTouchSize}px`;
          el.style.padding = el.style.padding || '8px 12px';
        }
      });
  }

  /**
   * P6-4.3g: Setup gesture support
   */
  private setupGestureSupport(): void {
    if (!this.config.enableGestureSupport || !this.deviceInfo.touchSupport) return;

    let isGesturing = false;
    let gestureStartDistance = 0;
    let gestureStartAngle = 0;

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        isGesturing = true;
        gestureStartDistance = this.getDistance(e.touches[0], e.touches[1]);
        gestureStartAngle = this.getAngle(e.touches[0], e.touches[1]);
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (isGesturing && e.touches.length === 2) {
        const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
        const currentAngle = this.getAngle(e.touches[0], e.touches[1]);
        
        const scale = currentDistance / gestureStartDistance;
        const rotation = currentAngle - gestureStartAngle;

        // Pinch gesture
        if (Math.abs(scale - 1) > 0.1) {
          this.triggerGesture({
            type: 'pinch',
            scale
          });
        }

        // Rotation gesture
        if (Math.abs(rotation) > 10) {
          this.triggerGesture({
            type: 'rotate',
            rotation
          });
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      isGesturing = false;
    }, { passive: true });

    // Swipe gesture detection
    this.setupSwipeDetection();
  }

  /**
   * P6-4.3h: Setup swipe detection
   */
  private setupSwipeDetection(): void {
    let startX = 0, startY = 0, endX = 0, endY = 0;
    const minSwipeDistance = 50;

    document.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const touch = e.changedTouches[0];
      endX = touch.clientX;
      endY = touch.clientY;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > minSwipeDistance) {
        let direction: 'up' | 'down' | 'left' | 'right';
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        } else {
          direction = deltaY > 0 ? 'down' : 'up';
        }

        this.triggerGesture({
          type: 'swipe',
          direction,
          distance,
          velocity: distance / (Date.now() - this.touchStartTime)
        });
      }
    }, { passive: true });
  }

  /**
   * P6-4.3i: Setup orientation handling
   */
  private setupOrientationHandling(): void {
    if (!this.config.orientationHandling) return;

    const handleOrientationChange = () => {
      // Wait for orientation change to complete
      setTimeout(() => {
        this.deviceInfo = this.detectDevice();
        document.body.className = document.body.className.replace(/orientation-\w+/, '');
        document.body.classList.add(`orientation-${this.deviceInfo.orientation}`);
        
        // Emit orientation change event
        window.dispatchEvent(new CustomEvent('mobile:orientationchange', {
          detail: { orientation: this.deviceInfo.orientation, deviceInfo: this.deviceInfo }
        }));
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    // Set initial orientation
    document.body.classList.add(`orientation-${this.deviceInfo.orientation}`);
  }

  /**
   * P6-4.3j: Setup mobile-specific CSS
   */
  private setupMobileCSS(): void {
    // Add CSS for mobile optimizations
    const style = document.createElement('style');
    style.textContent = `
      /* P6-4: Mobile Optimization Styles */
      .touch-device {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .mobile-device .button,
      .mobile-device button {
        min-height: 44px;
        min-width: 44px;
        padding: 12px 16px;
      }

      .mobile-device input,
      .mobile-device textarea {
        font-size: 16px; /* Prevent zoom on focus */
        min-height: 44px;
      }

      .mobile-device .navbar {
        height: 56px; /* Optimal mobile navbar height */
      }

      .keyboard-navigation .mobile-device *:focus {
        outline: 2px solid #007AFF;
        outline-offset: 2px;
      }

      /* Responsive utilities */
      .hide-mobile { display: block; }
      .show-mobile { display: none; }
      
      @media (max-width: 767px) {
        .hide-mobile { display: none !important; }
        .show-mobile { display: block !important; }
        .show-mobile.inline { display: inline !important; }
        .show-mobile.flex { display: flex !important; }
      }

      /* Touch-friendly spacing */
      .mobile-device .card,
      .mobile-device .modal {
        margin: 8px;
      }

      .mobile-device .form-group {
        margin-bottom: 20px;
      }

      /* Pull to refresh indicator */
      .pull-to-refresh {
        position: fixed;
        top: -60px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 20px;
        z-index: 9999;
        transition: top 0.3s ease;
      }

      .pull-to-refresh.active {
        top: 20px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * P6-4.3k: Prevent unwanted zoom
   */
  private preventZoom(): void {
    // Prevent double-tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, false);

    // Prevent pinch zoom if configured
    if (!this.config.viewport.userScalable) {
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('gesturechange', (e) => e.preventDefault());
      document.addEventListener('gestureend', (e) => e.preventDefault());
    }
  }

  /**
   * P6-4.4: Gesture utilities
   */
  private getDistance(touch1: Touch, touch2: Touch): number {
    const deltaX = touch2.clientX - touch1.clientX;
    const deltaY = touch2.clientY - touch1.clientY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  private getAngle(touch1: Touch, touch2: Touch): number {
    const deltaX = touch2.clientX - touch1.clientX;
    const deltaY = touch2.clientY - touch1.clientY;
    return Math.atan2(deltaY, deltaX) * 180 / Math.PI;
  }

  private triggerGesture(gesture: TouchGesture): void {
    // Emit gesture event
    window.dispatchEvent(new CustomEvent('mobile:gesture', { detail: gesture }));
    
    // Call registered handlers
    this.gestureHandlers.forEach(handler => handler(gesture));
  }

  /**
   * P6-4.5: Public API methods
   */
  getDeviceInfo(): DeviceInfo {
    return { ...this.deviceInfo };
  }

  isMobile(): boolean {
    return this.deviceInfo.isMobile;
  }

  isTablet(): boolean {
    return this.deviceInfo.isTablet;
  }

  isDesktop(): boolean {
    return this.deviceInfo.isDesktop;
  }

  getOrientation(): 'portrait' | 'landscape' {
    return this.deviceInfo.orientation;
  }

  getScreenSize(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
    return this.deviceInfo.screenSize;
  }

  /**
   * P6-4.6: Register gesture handlers
   */
  onGesture(type: TouchGesture['type'], handler: (gesture: TouchGesture) => void): void {
    const key = `${type}_${Date.now()}`;
    this.gestureHandlers.set(key, (gesture) => {
      if (gesture.type === type) {
        handler(gesture);
      }
    });
  }

  offGesture(type: TouchGesture['type']): void {
    for (const [key, handler] of this.gestureHandlers.entries()) {
      if (key.startsWith(type)) {
        this.gestureHandlers.delete(key);
      }
    }
  }

  /**
   * P6-4.7: Pull to refresh functionality
   */
  enablePullToRefresh(onRefresh: () => Promise<void> | void): void {
    if (!this.config.enablePullToRefresh || !this.deviceInfo.isMobile) return;

    let startY = 0;
    let currentY = 0;
    let pulling = false;
    let refreshTriggered = false;

    const indicator = document.createElement('div');
    indicator.className = 'pull-to-refresh';
    indicator.textContent = 'Pull to refresh';
    document.body.appendChild(indicator);

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
        refreshTriggered = false;
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;

      currentY = e.touches[0].clientY;
      const pullDistance = currentY - startY;

      if (pullDistance > 0 && pullDistance < 150) {
        indicator.style.top = `${Math.min(pullDistance - 60, 20)}px`;
        indicator.textContent = pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh';
        indicator.classList.toggle('active', pullDistance > 40);
      }
    }, { passive: true });

    document.addEventListener('touchend', async () => {
      if (!pulling) return;

      const pullDistance = currentY - startY;
      pulling = false;

      if (pullDistance > 80 && !refreshTriggered) {
        refreshTriggered = true;
        indicator.textContent = 'Refreshing...';
        indicator.classList.add('active');

        try {
          await onRefresh();
          indicator.textContent = 'Refreshed!';
          setTimeout(() => {
            indicator.classList.remove('active');
          }, 1000);
        } catch (error) {
          indicator.textContent = 'Refresh failed';
          setTimeout(() => {
            indicator.classList.remove('active');
          }, 2000);
        }
      } else {
        indicator.classList.remove('active');
      }
    }, { passive: true });
  }

  /**
   * P6-4.8: Responsive utilities
   */
  addResponsiveClasses(): void {
    const { screenSize, isMobile, isTablet, isDesktop, orientation } = this.deviceInfo;
    
    document.body.classList.remove('xs', 'sm', 'md', 'lg', 'xl', 'mobile', 'tablet', 'desktop', 'portrait', 'landscape');
    document.body.classList.add(screenSize, orientation);
    
    if (isMobile) document.body.classList.add('mobile');
    if (isTablet) document.body.classList.add('tablet');
    if (isDesktop) document.body.classList.add('desktop');
  }
}

/**
 * P6-4.9: React hooks for mobile optimization
 */
import { useEffect, useState } from 'react';

export function useMobile() {
  const mobileOptimizer = MobileOptimizer.getInstance();
  const [deviceInfo, setDeviceInfo] = useState(mobileOptimizer.getDeviceInfo());

  useEffect(() => {
    const handleOrientationChange = (event: CustomEvent) => {
      setDeviceInfo(event.detail.deviceInfo);
    };

    window.addEventListener('mobile:orientationchange', handleOrientationChange as EventListener);
    
    return () => {
      window.removeEventListener('mobile:orientationchange', handleOrientationChange as EventListener);
    };
  }, []);

  return {
    deviceInfo,
    isMobile: deviceInfo.isMobile,
    isTablet: deviceInfo.isTablet,
    isDesktop: deviceInfo.isDesktop,
    orientation: deviceInfo.orientation,
    screenSize: deviceInfo.screenSize,
    touchSupport: deviceInfo.touchSupport
  };
}

export function useGestures() {
  const mobileOptimizer = MobileOptimizer.getInstance();
  const [lastGesture, setLastGesture] = useState<TouchGesture | null>(null);

  useEffect(() => {
    const handleGesture = (event: CustomEvent) => {
      setLastGesture(event.detail);
    };

    window.addEventListener('mobile:gesture', handleGesture as EventListener);
    
    return () => {
      window.removeEventListener('mobile:gesture', handleGesture as EventListener);
    };
  }, []);

  return {
    lastGesture,
    onGesture: (type: TouchGesture['type'], handler: (gesture: TouchGesture) => void) => 
      mobileOptimizer.onGesture(type, handler),
    offGesture: (type: TouchGesture['type']) => 
      mobileOptimizer.offGesture(type)
  };
}

/**
 * P6-4.10: Initialize mobile optimization system
 */
export function initializeMobileOptimization(config?: Partial<MobileConfig>): void {
  const mobileOptimizer = MobileOptimizer.getInstance();
  mobileOptimizer.initialize(config);
  mobileOptimizer.addResponsiveClasses();
}