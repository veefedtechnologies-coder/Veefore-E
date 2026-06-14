/**
 * Mobile Utilities Module
 * 
 * Consolidated mobile optimization utilities including:
 * - Touch handlers and gesture detection
 * - Responsive breakpoint utilities
 * - Performance monitoring and adaptive loading
 * 
 * @module shared/utils/mobile
 */

// Touch Handlers
export {
  TouchGestureHandler,
  SwipeHandler,
  reduceTouchDelay,
  preventDefaultTouchBehaviors,
  createTouchRipple,
  isTouchDevice,
  getTouchCoordinates,
  type TouchPoint,
  type SwipeEvent,
  type PinchEvent,
  type TapEvent,
  type GestureConfig,
} from './touchHandlers';

// Responsive Utilities
export {
  MediaQueryHelper,
  getViewportInfo,
  getScreenSize,
  getOrientation,
  getDeviceType,
  matchesBreakpoint,
  isAtLeast,
  isBelow,
  isMobile,
  isTablet,
  isDesktop,
  getResponsiveImageSrc,
  generateSrcSet,
  calculateOptimalImageWidth,
  pxToVw,
  pxToVh,
  vwToPx,
  vhToPx,
  calculateResponsiveFontSize,
  observeContainer,
  getSafeAreaInsets,
  applySafeAreaInsets,
  isPWA,
  getViewportPosition,
  BREAKPOINTS,
  type ScreenSize,
  type Orientation,
  type DeviceType,
  type Breakpoint,
  type ViewportInfo,
  type ResponsiveImageSizes,
  type ContainerSize,
} from './responsive';

// Performance Utilities
export {
  NetworkMonitor,
  BatteryMonitor,
  LazyLoadManager,
  PerformanceMetricsCollector,
  getDeviceCapabilities,
  getDeviceTier,
  loadAdaptiveImage,
  prefetchResource,
  preloadResource,
  debounce,
  throttle,
  runWhenIdle,
  prefersReducedMotion,
  type NetworkType,
  type LoadingStrategy,
  type NetworkInfo,
  type BatteryInfo,
  type DeviceCapabilities,
  type PerformanceMetrics,
  type AdaptiveImageOptions,
} from './performance';
