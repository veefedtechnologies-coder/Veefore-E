/**
 * Mobile Optimization Service
 * 
 * Consolidated service for mobile-specific functionality:
 * - Device detection (isMobile, isTablet, OS detection)
 * - Responsive breakpoint calculations
 * - Touch event handling utilities
 * 
 * Consolidates functionality from:
 * - mobile-excellence.ts
 * - mobile-optimization.ts
 * - mobile-performance.ts
 * 
 * Requirements: 23.2, 23.3, 23.4
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  orientation: 'portrait' | 'landscape';
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  touchSupport: boolean;
  pixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  os: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';
  osVersion: string;
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'opera' | 'unknown';
  browserVersion: string;
}

export interface TouchGesture {
  type: 'tap' | 'swipe' | 'pinch' | 'rotate' | 'pan' | 'longpress';
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  velocity?: number;
  scale?: number;
  rotation?: number;
  duration?: number;
}

export interface ResponsiveBreakpoint {
  name: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  minWidth: number;
  maxWidth: number | null;
}

export interface TouchEventHandlers {
  onTap?: (event: TouchEvent) => void;
  onSwipe?: (gesture: TouchGesture) => void;
  onPinch?: (gesture: TouchGesture) => void;
  onRotate?: (gesture: TouchGesture) => void;
  onLongPress?: (event: TouchEvent) => void;
}

// ============================================================================
// Constants
// ============================================================================

export const BREAKPOINTS: ResponsiveBreakpoint[] = [
  { name: 'xs', minWidth: 0, maxWidth: 575 },
  { name: 'sm', minWidth: 576, maxWidth: 767 },
  { name: 'md', minWidth: 768, maxWidth: 991 },
  { name: 'lg', minWidth: 992, maxWidth: 1199 },
  { name: 'xl', minWidth: 1200, maxWidth: null },
];

const MIN_TOUCH_TARGET_SIZE = 44; // Apple HIG recommendation
const SWIPE_MIN_DISTANCE = 50; // pixels
const SWIPE_MAX_DURATION = 300; // ms
const LONG_PRESS_DURATION = 500; // ms

// ============================================================================
// MobileOptimizationService Class
// ============================================================================

export class MobileOptimizationService {
  private static instance: MobileOptimizationService;
  private deviceInfo: DeviceInfo | null = null;
  private longPressTimer: number | null = null;
  private isLongPress = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): MobileOptimizationService {
    if (!MobileOptimizationService.instance) {
      MobileOptimizationService.instance = new MobileOptimizationService();
    }
    return MobileOptimizationService.instance;
  }

  // ==========================================================================
  // Device Detection
  // ==========================================================================

  /**
   * Detect device information including type, OS, browser
   * Validates: Requirements 23.2
   */
  public detectDevice(): DeviceInfo {
    if (this.deviceInfo) {
      return this.deviceInfo;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const screenWidth = window.screen.width;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Detect device type
    const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
      (screenWidth <= 768 && 'ontouchstart' in window);
    
    const isTablet = /ipad|android(?=.*tablet)|tablet/i.test(userAgent) ||
      (screenWidth > 768 && screenWidth <= 1024 && 'ontouchstart' in window);
    
    const isDesktop = !isMobile && !isTablet;

    // Detect OS
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    
    let os: DeviceInfo['os'] = 'unknown';
    let osVersion = 'unknown';

    if (isIOS) {
      os = 'ios';
      const match = userAgent.match(/os (\d+)_(\d+)_?(\d+)?/);
      if (match) {
        osVersion = `${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`;
      }
    } else if (isAndroid) {
      os = 'android';
      const match = userAgent.match(/android (\d+\.?\d*)/);
      if (match) {
        osVersion = match[1];
      }
    } else if (/windows/.test(userAgent)) {
      os = 'windows';
    } else if (/macintosh|mac os x/.test(userAgent)) {
      os = 'macos';
    } else if (/linux/.test(userAgent)) {
      os = 'linux';
    }

    // Detect browser
    let browser: DeviceInfo['browser'] = 'unknown';
    let browserVersion = 'unknown';

    if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
      browser = 'safari';
      const match = userAgent.match(/version\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (/chrome/.test(userAgent) && !/edge/.test(userAgent)) {
      browser = 'chrome';
      const match = userAgent.match(/chrome\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (/firefox/.test(userAgent)) {
      browser = 'firefox';
      const match = userAgent.match(/firefox\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (/edge/.test(userAgent)) {
      browser = 'edge';
      const match = userAgent.match(/edge\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (/opera/.test(userAgent) || /opr/.test(userAgent)) {
      browser = 'opera';
      const match = userAgent.match(/(?:opera|opr)\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    }

    // Detect screen size category
    const screenSize = this.getScreenSizeCategory(viewportWidth);

    // Detect orientation
    const orientation = viewportHeight > viewportWidth ? 'portrait' : 'landscape';

    this.deviceInfo = {
      isMobile,
      isTablet,
      isDesktop,
      isIOS,
      isAndroid,
      orientation,
      screenSize,
      touchSupport: 'ontouchstart' in window,
      pixelRatio: window.devicePixelRatio || 1,
      viewportWidth,
      viewportHeight,
      os,
      osVersion,
      browser,
      browserVersion,
    };

    return this.deviceInfo;
  }

  /**
   * Get cached device info or detect fresh
   */
  public getDeviceInfo(): DeviceInfo {
    if (!this.deviceInfo) {
      return this.detectDevice();
    }
    return this.deviceInfo;
  }

  /**
   * Refresh device info (useful after orientation change)
   */
  public refreshDeviceInfo(): DeviceInfo {
    this.deviceInfo = null;
    return this.detectDevice();
  }

  /**
   * Check if current device is mobile
   */
  public isMobile(): boolean {
    return this.getDeviceInfo().isMobile;
  }

  /**
   * Check if current device is tablet
   */
  public isTablet(): boolean {
    return this.getDeviceInfo().isTablet;
  }

  /**
   * Check if current device is desktop
   */
  public isDesktop(): boolean {
    return this.getDeviceInfo().isDesktop;
  }

  /**
   * Check if current device is iOS
   */
  public isIOS(): boolean {
    return this.getDeviceInfo().isIOS;
  }

  /**
   * Check if current device is Android
   */
  public isAndroid(): boolean {
    return this.getDeviceInfo().isAndroid;
  }

  /**
   * Get current orientation
   */
  public getOrientation(): 'portrait' | 'landscape' {
    return this.getDeviceInfo().orientation;
  }

  // ==========================================================================
  // Responsive Breakpoint Calculations
  // ==========================================================================

  /**
   * Get screen size category based on viewport width
   * Validates: Requirements 23.3
   */
  public getScreenSizeCategory(width?: number): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
    const viewportWidth = width ?? window.innerWidth;

    for (const breakpoint of BREAKPOINTS) {
      if (viewportWidth >= breakpoint.minWidth) {
        if (breakpoint.maxWidth === null || viewportWidth <= breakpoint.maxWidth) {
          return breakpoint.name;
        }
      }
    }

    return 'md'; // default fallback
  }

  /**
   * Get current screen size category
   */
  public getCurrentScreenSize(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
    return this.getScreenSizeCategory();
  }

  /**
   * Check if viewport matches a specific breakpoint
   */
  public matchesBreakpoint(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): boolean {
    return this.getCurrentScreenSize() === breakpoint;
  }

  /**
   * Check if viewport is at or above a breakpoint
   */
  public isBreakpointOrLarger(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): boolean {
    const currentWidth = window.innerWidth;
    const targetBreakpoint = BREAKPOINTS.find(bp => bp.name === breakpoint);
    
    if (!targetBreakpoint) return false;
    
    return currentWidth >= targetBreakpoint.minWidth;
  }

  /**
   * Check if viewport is at or below a breakpoint
   */
  public isBreakpointOrSmaller(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): boolean {
    const currentWidth = window.innerWidth;
    const targetBreakpoint = BREAKPOINTS.find(bp => bp.name === breakpoint);
    
    if (!targetBreakpoint) return false;
    
    if (targetBreakpoint.maxWidth === null) {
      return true; // xl breakpoint has no upper limit
    }
    
    return currentWidth <= targetBreakpoint.maxWidth;
  }

  /**
   * Get breakpoint configuration
   */
  public getBreakpoint(name: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): ResponsiveBreakpoint | undefined {
    return BREAKPOINTS.find(bp => bp.name === name);
  }

  /**
   * Get all breakpoints
   */
  public getAllBreakpoints(): ResponsiveBreakpoint[] {
    return [...BREAKPOINTS];
  }

  // ==========================================================================
  // Touch Event Handling
  // ==========================================================================

  /**
   * Setup touch event listeners for gesture detection
   * Validates: Requirements 23.4
   */
  public setupTouchHandlers(element: HTMLElement, handlers: TouchEventHandlers): () => void {
    if (!this.getDeviceInfo().touchSupport) {
      console.warn('Touch events not supported on this device');
      return () => {};
    }

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let initialDistance = 0;
    let initialAngle = 0;
    let isMultiTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      this.isLongPress = false;

      if (e.touches.length === 2) {
        isMultiTouch = true;
        initialDistance = this.calculateDistance(e.touches[0], e.touches[1]);
        initialAngle = this.calculateAngle(e.touches[0], e.touches[1]);
      }

      // Setup long press detection
      if (handlers.onLongPress) {
        this.longPressTimer = window.setTimeout(() => {
          this.isLongPress = true;
          handlers.onLongPress!(e);
        }, LONG_PRESS_DURATION);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Cancel long press if moved
      if (this.longPressTimer) {
        window.clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      if (isMultiTouch && e.touches.length === 2) {
        // Pinch gesture
        if (handlers.onPinch) {
          const currentDistance = this.calculateDistance(e.touches[0], e.touches[1]);
          const scale = currentDistance / initialDistance;
          
          handlers.onPinch({
            type: 'pinch',
            scale,
            distance: currentDistance - initialDistance,
          });
        }

        // Rotate gesture
        if (handlers.onRotate) {
          const currentAngle = this.calculateAngle(e.touches[0], e.touches[1]);
          const rotation = currentAngle - initialAngle;
          
          if (Math.abs(rotation) > 10) {
            handlers.onRotate({
              type: 'rotate',
              rotation,
            });
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Clear long press timer
      if (this.longPressTimer) {
        window.clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      if (this.isLongPress) {
        return; // Already handled
      }

      const touch = e.changedTouches[0];
      const endX = touch.clientX;
      const endY = touch.clientY;
      const endTime = Date.now();
      const duration = endTime - startTime;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Tap detection
      if (distance < 10 && duration < 300 && handlers.onTap) {
        handlers.onTap(e);
        return;
      }

      // Swipe detection
      if (distance > SWIPE_MIN_DISTANCE && duration < SWIPE_MAX_DURATION && handlers.onSwipe) {
        let direction: 'up' | 'down' | 'left' | 'right';
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        } else {
          direction = deltaY > 0 ? 'down' : 'up';
        }

        const velocity = distance / duration; // pixels per ms

        handlers.onSwipe({
          type: 'swipe',
          direction,
          distance,
          velocity,
          duration,
        });
      }

      isMultiTouch = false;
    };

    // Add event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Return cleanup function
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      
      if (this.longPressTimer) {
        window.clearTimeout(this.longPressTimer);
      }
    };
  }

  /**
   * Calculate distance between two touch points
   */
  private calculateDistance(touch1: Touch, touch2: Touch): number {
    const deltaX = touch2.clientX - touch1.clientX;
    const deltaY = touch2.clientY - touch1.clientY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  /**
   * Calculate angle between two touch points
   */
  private calculateAngle(touch1: Touch, touch2: Touch): number {
    const deltaX = touch2.clientX - touch1.clientX;
    const deltaY = touch2.clientY - touch1.clientY;
    return Math.atan2(deltaY, deltaX) * 180 / Math.PI;
  }

  /**
   * Optimize touch target sizes for mobile
   */
  public optimizeTouchTargets(container?: HTMLElement): void {
    const root = container || document.body;
    const touchableElements = root.querySelectorAll('button, a, input[type="button"], input[type="submit"]');

    touchableElements.forEach((element) => {
      const el = element as HTMLElement;
      const rect = el.getBoundingClientRect();

      if (rect.width < MIN_TOUCH_TARGET_SIZE || rect.height < MIN_TOUCH_TARGET_SIZE) {
        el.style.minWidth = `${MIN_TOUCH_TARGET_SIZE}px`;
        el.style.minHeight = `${MIN_TOUCH_TARGET_SIZE}px`;
        
        if (!el.style.padding) {
          el.style.padding = '8px 12px';
        }
      }
    });
  }

  /**
   * Prevent default touch behaviors (zoom, selection)
   */
  public preventDefaultTouchBehaviors(element: HTMLElement): () => void {
    const preventGesture = (e: Event) => e.preventDefault();

    element.addEventListener('gesturestart', preventGesture);
    element.addEventListener('gesturechange', preventGesture);
    element.addEventListener('gestureend', preventGesture);

    element.style.touchAction = 'manipulation';
    element.style.userSelect = 'none';
    (element.style as any).webkitUserSelect = 'none';
    (element.style as any).webkitTouchCallout = 'none';

    return () => {
      element.removeEventListener('gesturestart', preventGesture);
      element.removeEventListener('gesturechange', preventGesture);
      element.removeEventListener('gestureend', preventGesture);
    };
  }

  // ==========================================================================
  // Viewport and Orientation Utilities
  // ==========================================================================

  /**
   * Setup viewport meta tag for mobile optimization
   */
  public setupViewportMeta(options?: {
    width?: string;
    initialScale?: string;
    maximumScale?: string;
    userScalable?: boolean;
  }): void {
    let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;

    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }

    const {
      width = 'device-width',
      initialScale = '1.0',
      maximumScale = '1.0',
      userScalable = false,
    } = options || {};

    viewport.content = `width=${width}, initial-scale=${initialScale}, maximum-scale=${maximumScale}, user-scalable=${userScalable ? 'yes' : 'no'}`;
  }

  /**
   * Monitor orientation changes
   */
  public onOrientationChange(callback: (orientation: 'portrait' | 'landscape') => void): () => void {
    const handleChange = () => {
      this.refreshDeviceInfo();
      callback(this.getOrientation());
    };

    window.addEventListener('orientationchange', handleChange);
    window.addEventListener('resize', handleChange);

    return () => {
      window.removeEventListener('orientationchange', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }

  /**
   * Monitor screen size changes
   */
  public onScreenSizeChange(callback: (screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl') => void): () => void {
    let currentSize = this.getCurrentScreenSize();

    const handleResize = () => {
      const newSize = this.getCurrentScreenSize();
      
      if (newSize !== currentSize) {
        currentSize = newSize;
        callback(newSize);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }

  // ==========================================================================
  // CSS and Styling Utilities
  // ==========================================================================

  /**
   * Apply mobile-specific CSS classes to body
   */
  public applyMobileClasses(): void {
    const device = this.getDeviceInfo();
    const body = document.body;

    // Remove existing classes
    body.classList.remove(
      'mobile-device', 'tablet-device', 'desktop-device',
      'ios-device', 'android-device',
      'portrait', 'landscape',
      'xs', 'sm', 'md', 'lg', 'xl'
    );

    // Add device type classes
    if (device.isMobile) body.classList.add('mobile-device');
    if (device.isTablet) body.classList.add('tablet-device');
    if (device.isDesktop) body.classList.add('desktop-device');

    // Add OS classes
    if (device.isIOS) body.classList.add('ios-device');
    if (device.isAndroid) body.classList.add('android-device');

    // Add orientation class
    body.classList.add(device.orientation);

    // Add screen size class
    body.classList.add(device.screenSize);

    // Add touch support class
    if (device.touchSupport) {
      body.classList.add('touch-device');
    }
  }

  /**
   * Inject mobile optimization CSS
   */
  public injectMobileCSS(): void {
    const existingStyle = document.getElementById('mobile-optimization-styles');
    if (existingStyle) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'mobile-optimization-styles';
    style.textContent = `
      /* Mobile Optimization Service Styles */
      .touch-device {
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
      }

      .mobile-device input,
      .mobile-device textarea,
      .mobile-device select {
        font-size: 16px !important; /* Prevent zoom on focus */
      }

      .mobile-device button,
      .mobile-device .button {
        min-height: ${MIN_TOUCH_TARGET_SIZE}px;
        min-width: ${MIN_TOUCH_TARGET_SIZE}px;
      }

      /* Responsive utilities */
      .hide-mobile { display: block; }
      .show-mobile { display: none; }
      
      @media (max-width: 767px) {
        .hide-mobile { display: none !important; }
        .show-mobile { display: block !important; }
      }
    `;
    
    document.head.appendChild(style);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get safe area insets for iOS devices with notches
   */
  public getSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
    if (!this.isIOS()) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    const computedStyle = getComputedStyle(document.documentElement);

    return {
      top: parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0', 10),
      right: parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0', 10),
      bottom: parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0', 10),
      left: parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0', 10),
    };
  }

  /**
   * Check if device is in standalone mode (PWA)
   */
  public isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  /**
   * Get device pixel ratio
   */
  public getPixelRatio(): number {
    return window.devicePixelRatio || 1;
  }

  /**
   * Check if device supports hover
   */
  public supportsHover(): boolean {
    return window.matchMedia('(hover: hover)').matches;
  }

  /**
   * Check if reduced motion is preferred
   */
  public prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Check if dark mode is preferred
   */
  public prefersDarkMode(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const mobileOptimizationService = MobileOptimizationService.getInstance();

// ============================================================================
// React Hooks
// ============================================================================

import { useEffect, useState, useCallback } from 'react';

/**
 * React hook for device detection
 */
export function useDeviceInfo(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() =>
    mobileOptimizationService.getDeviceInfo()
  );

  useEffect(() => {
    const handleChange = () => {
      setDeviceInfo(mobileOptimizationService.refreshDeviceInfo());
    };

    window.addEventListener('resize', handleChange);
    window.addEventListener('orientationchange', handleChange);

    return () => {
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('orientationchange', handleChange);
    };
  }, []);

  return deviceInfo;
}

/**
 * React hook for mobile detection
 */
export function useIsMobile(): boolean {
  const deviceInfo = useDeviceInfo();
  return deviceInfo.isMobile;
}

/**
 * React hook for tablet detection
 */
export function useIsTablet(): boolean {
  const deviceInfo = useDeviceInfo();
  return deviceInfo.isTablet;
}

/**
 * React hook for screen size detection
 */
export function useScreenSize(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
  const [screenSize, setScreenSize] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl'>(() =>
    mobileOptimizationService.getCurrentScreenSize()
  );

  useEffect(() => {
    const cleanup = mobileOptimizationService.onScreenSizeChange((newSize) => {
      setScreenSize(newSize);
    });

    return cleanup;
  }, []);

  return screenSize;
}

/**
 * React hook for breakpoint matching
 */
export function useBreakpoint(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): boolean {
  const screenSize = useScreenSize();
  return screenSize === breakpoint;
}

/**
 * React hook for responsive breakpoint checks
 */
export function useBreakpointOrLarger(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): boolean {
  const [matches, setMatches] = useState(() =>
    mobileOptimizationService.isBreakpointOrLarger(breakpoint)
  );

  useEffect(() => {
    const handleResize = () => {
      setMatches(mobileOptimizationService.isBreakpointOrLarger(breakpoint));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return matches;
}

/**
 * React hook for touch gesture handling
 */
export function useTouchGestures(handlers: TouchEventHandlers) {
  const [element, setElement] = useState<HTMLElement | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const cleanup = mobileOptimizationService.setupTouchHandlers(element, handlers);
    return cleanup;
  }, [element, handlers]);

  return ref;
}

/**
 * React hook for orientation detection
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    mobileOptimizationService.getOrientation()
  );

  useEffect(() => {
    const cleanup = mobileOptimizationService.onOrientationChange((newOrientation) => {
      setOrientation(newOrientation);
    });

    return cleanup;
  }, []);

  return orientation;
}

// ============================================================================
// Initialization and Setup
// ============================================================================

/**
 * Initialize mobile optimization service
 * Call this once at app startup
 */
export function initializeMobileOptimization(options?: {
  applyClasses?: boolean;
  injectCSS?: boolean;
  setupViewport?: boolean;
  optimizeTouchTargets?: boolean;
}): void {
  const {
    applyClasses = true,
    injectCSS = true,
    setupViewport = true,
    optimizeTouchTargets = true,
  } = options || {};

  const service = mobileOptimizationService;

  // Detect device info
  service.detectDevice();

  // Apply CSS classes
  if (applyClasses) {
    service.applyMobileClasses();
  }

  // Inject mobile optimization CSS
  if (injectCSS) {
    service.injectMobileCSS();
  }

  // Setup viewport meta tag
  if (setupViewport) {
    service.setupViewportMeta();
  }

  // Optimize touch targets
  if (optimizeTouchTargets && service.isMobile()) {
    service.optimizeTouchTargets();
  }

  console.log('📱 Mobile Optimization Service initialized', service.getDeviceInfo());
}

// ============================================================================
// Default Export
// ============================================================================

export default mobileOptimizationService;
