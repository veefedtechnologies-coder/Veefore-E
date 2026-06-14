/**
 * Mobile Responsive Utilities
 * 
 * Provides breakpoint utilities, media query helpers, viewport detection,
 * and responsive layout utilities for mobile-first design.
 * 
 * @module shared/utils/mobile/responsive
 */

export type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export type Orientation = 'portrait' | 'landscape';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface Breakpoint {
  name: ScreenSize;
  minWidth: number;
  maxWidth?: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
  screenSize: ScreenSize;
  orientation: Orientation;
  deviceType: DeviceType;
  pixelRatio: number;
  isRetina: boolean;
}

/**
 * Standard breakpoints (mobile-first approach)
 */
export const BREAKPOINTS: Record<ScreenSize, Breakpoint> = {
  xs: { name: 'xs', minWidth: 0, maxWidth: 575 },
  sm: { name: 'sm', minWidth: 576, maxWidth: 767 },
  md: { name: 'md', minWidth: 768, maxWidth: 991 },
  lg: { name: 'lg', minWidth: 992, maxWidth: 1199 },
  xl: { name: 'xl', minWidth: 1200, maxWidth: 1399 },
  xxl: { name: 'xxl', minWidth: 1400 },
};

/**
 * Get current viewport information
 */
export function getViewportInfo(): ViewportInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  return {
    width,
    height,
    screenSize: getScreenSize(width),
    orientation: getOrientation(width, height),
    deviceType: getDeviceType(),
    pixelRatio,
    isRetina: pixelRatio >= 2,
  };
}

/**
 * Get current screen size based on width
 */
export function getScreenSize(width?: number): ScreenSize {
  const viewportWidth = width ?? window.innerWidth;

  if (viewportWidth < BREAKPOINTS.sm.minWidth) return 'xs';
  if (viewportWidth < BREAKPOINTS.md.minWidth) return 'sm';
  if (viewportWidth < BREAKPOINTS.lg.minWidth) return 'md';
  if (viewportWidth < BREAKPOINTS.xl.minWidth) return 'lg';
  if (viewportWidth < BREAKPOINTS.xxl.minWidth) return 'xl';
  return 'xxl';
}

/**
 * Get current orientation
 */
export function getOrientation(width?: number, height?: number): Orientation {
  const w = width ?? window.innerWidth;
  const h = height ?? window.innerHeight;
  return h > w ? 'portrait' : 'landscape';
}

/**
 * Detect device type based on screen size and user agent
 */
export function getDeviceType(): DeviceType {
  const userAgent = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  // Check user agent first
  const isMobileUA =
    /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );
  const isTabletUA =
    /ipad|android(?=.*tablet)|tablet|kindle|playbook|silk/i.test(userAgent);

  // Check screen size
  if (isMobileUA || width < BREAKPOINTS.sm.minWidth) return 'mobile';
  if (isTabletUA || (width >= BREAKPOINTS.sm.minWidth && width < BREAKPOINTS.lg.minWidth))
    return 'tablet';
  return 'desktop';
}

/**
 * Check if current viewport matches a breakpoint
 */
export function matchesBreakpoint(size: ScreenSize): boolean {
  const width = window.innerWidth;
  const breakpoint = BREAKPOINTS[size];

  if (breakpoint.maxWidth) {
    return width >= breakpoint.minWidth && width <= breakpoint.maxWidth;
  }
  return width >= breakpoint.minWidth;
}

/**
 * Check if viewport is at or above a breakpoint
 */
export function isAtLeast(size: ScreenSize): boolean {
  const width = window.innerWidth;
  return width >= BREAKPOINTS[size].minWidth;
}

/**
 * Check if viewport is below a breakpoint
 */
export function isBelow(size: ScreenSize): boolean {
  const width = window.innerWidth;
  const maxWidth = BREAKPOINTS[size].maxWidth;
  return maxWidth ? width <= maxWidth : false;
}

/**
 * Check if device is mobile (xs or sm)
 */
export function isMobile(): boolean {
  const screenSize = getScreenSize();
  return screenSize === 'xs' || screenSize === 'sm';
}

/**
 * Check if device is tablet (md)
 */
export function isTablet(): boolean {
  return getScreenSize() === 'md';
}

/**
 * Check if device is desktop (lg, xl, or xxl)
 */
export function isDesktop(): boolean {
  const screenSize = getScreenSize();
  return screenSize === 'lg' || screenSize === 'xl' || screenSize === 'xxl';
}

/**
 * Media Query Helper Class
 */
export class MediaQueryHelper {
  private listeners: Map<string, Set<() => void>> = new Map();
  private mediaQueries: Map<string, MediaQueryList> = new Map();

  /**
   * Create a media query listener
   */
  onBreakpoint(
    size: ScreenSize,
    callback: (matches: boolean) => void
  ): () => void {
    const breakpoint = BREAKPOINTS[size];
    let query = `(min-width: ${breakpoint.minWidth}px)`;

    if (breakpoint.maxWidth) {
      query += ` and (max-width: ${breakpoint.maxWidth}px)`;
    }

    return this.addMediaQuery(query, callback);
  }

  /**
   * Create a custom media query listener
   */
  addMediaQuery(query: string, callback: (matches: boolean) => void): () => void {
    const mediaQuery = window.matchMedia(query);

    // Initial call
    callback(mediaQuery.matches);

    // Setup listener
    const handler = (event: MediaQueryListEvent) => {
      callback(event.matches);
    };

    mediaQuery.addEventListener('change', handler);

    // Return cleanup function
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }

  /**
   * Listen for orientation changes
   */
  onOrientationChange(callback: (orientation: Orientation) => void): () => void {
    const handler = () => {
      callback(getOrientation());
    };

    window.addEventListener('orientationchange', handler);
    window.addEventListener('resize', handler);

    // Initial call
    callback(getOrientation());

    return () => {
      window.removeEventListener('orientationchange', handler);
      window.removeEventListener('resize', handler);
    };
  }

  /**
   * Listen for viewport changes
   */
  onViewportChange(callback: (info: ViewportInfo) => void): () => void {
    let timeoutId: NodeJS.Timeout;

    const handler = () => {
      // Debounce resize events
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback(getViewportInfo());
      }, 150);
    };

    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);

    // Initial call
    callback(getViewportInfo());

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.listeners.clear();
    this.mediaQueries.clear();
  }
}

/**
 * Responsive Image Helper
 */
export interface ResponsiveImageSizes {
  xs?: string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
  xxl?: string;
}

export function getResponsiveImageSrc(
  sizes: ResponsiveImageSizes,
  defaultSrc: string
): string {
  const screenSize = getScreenSize();

  // Return the appropriate image for current screen size
  switch (screenSize) {
    case 'xs':
      return sizes.xs || sizes.sm || sizes.md || defaultSrc;
    case 'sm':
      return sizes.sm || sizes.md || defaultSrc;
    case 'md':
      return sizes.md || sizes.lg || defaultSrc;
    case 'lg':
      return sizes.lg || sizes.xl || defaultSrc;
    case 'xl':
      return sizes.xl || sizes.xxl || defaultSrc;
    case 'xxl':
      return sizes.xxl || sizes.xl || defaultSrc;
    default:
      return defaultSrc;
  }
}

/**
 * Generate srcset string for responsive images
 */
export function generateSrcSet(
  basePath: string,
  widths: number[],
  format?: string
): string {
  return widths
    .map((width) => {
      const ext = format || basePath.split('.').pop();
      const path = basePath.replace(/\.[^.]+$/, `-${width}w.${ext}`);
      return `${path} ${width}w`;
    })
    .join(', ');
}

/**
 * Calculate optimal image width based on viewport and pixel ratio
 */
export function calculateOptimalImageWidth(
  containerWidth: number,
  maxWidth?: number
): number {
  const pixelRatio = window.devicePixelRatio || 1;
  const optimalWidth = Math.ceil(containerWidth * pixelRatio);

  if (maxWidth) {
    return Math.min(optimalWidth, maxWidth);
  }

  return optimalWidth;
}

/**
 * Viewport CSS Unit Utilities
 */
export function pxToVw(px: number, viewportWidth?: number): string {
  const vw = viewportWidth || window.innerWidth;
  return `${(px / vw) * 100}vw`;
}

export function pxToVh(px: number, viewportHeight?: number): string {
  const vh = viewportHeight || window.innerHeight;
  return `${(px / vh) * 100}vh`;
}

export function vwToPx(vw: number, viewportWidth?: number): number {
  const width = viewportWidth || window.innerWidth;
  return (vw / 100) * width;
}

export function vhToPx(vh: number, viewportHeight?: number): number {
  const height = viewportHeight || window.innerHeight;
  return (vh / 100) * height;
}

/**
 * Responsive Font Size Calculator
 */
export function calculateResponsiveFontSize(
  minSize: number,
  maxSize: number,
  minViewport = 320,
  maxViewport = 1920
): string {
  const viewport = window.innerWidth;

  if (viewport <= minViewport) return `${minSize}px`;
  if (viewport >= maxViewport) return `${maxSize}px`;

  const slope = (maxSize - minSize) / (maxViewport - minViewport);
  const intercept = minSize - slope * minViewport;

  return `calc(${intercept}px + ${slope * 100}vw)`;
}

/**
 * Container Query Helper
 * For supporting container queries in a consistent way
 */
export interface ContainerSize {
  width: number;
  height: number;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function observeContainer(
  element: HTMLElement,
  callback: (size: ContainerSize) => void
): () => void {
  if (!('ResizeObserver' in window)) {
    console.warn('ResizeObserver not supported');
    return () => {};
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;

      let size: ContainerSize['size'] = 'md';
      if (width < 400) size = 'xs';
      else if (width < 600) size = 'sm';
      else if (width < 900) size = 'md';
      else if (width < 1200) size = 'lg';
      else size = 'xl';

      callback({ width, height, size });
    }
  });

  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

/**
 * Safe Area Insets (for notched devices)
 */
export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const style = getComputedStyle(document.documentElement);

  return {
    top: parseInt(style.getPropertyValue('--sat') || '0', 10),
    right: parseInt(style.getPropertyValue('--sar') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--sab') || '0', 10),
    left: parseInt(style.getPropertyValue('--sal') || '0', 10),
  };
}

/**
 * Apply safe area CSS custom properties
 */
export function applySafeAreaInsets(): void {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --sat: env(safe-area-inset-top);
      --sar: env(safe-area-inset-right);
      --sab: env(safe-area-inset-bottom);
      --sal: env(safe-area-inset-left);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Detect if running as PWA
 */
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Get viewport-relative position
 */
export function getViewportPosition(element: HTMLElement): {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
} {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    x: rect.left,
    y: rect.top,
    xPercent: (rect.left / viewportWidth) * 100,
    yPercent: (rect.top / viewportHeight) * 100,
  };
}
