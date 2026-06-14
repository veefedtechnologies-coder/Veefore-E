# Mobile Utilities

Consolidated mobile optimization utilities providing touch handling, responsive design, and performance optimization for mobile devices.

## Overview

This module consolidates mobile-specific functionality from the legacy mobile libraries (`mobile-excellence.ts`, `mobile-optimization.ts`, `mobile-performance.ts`) into focused, maintainable utility modules.

## Modules

### 1. Touch Handlers (`touchHandlers.ts`)

Provides gesture detection, swipe handlers, and touch event management.

#### Key Features

- **Touch Gesture Detection**: Tap, double-tap, long-press, swipe, pinch
- **Swipe Handler**: Easy-to-use swipe navigation
- **Touch Optimization**: Eliminate 300ms tap delay
- **Touch Ripple Effects**: Material Design-style ripple feedback

#### Usage

```typescript
import { TouchGestureHandler, SwipeHandler, isTouchDevice } from '@/shared/utils/mobile';

// Gesture detection
const gestureHandler = new TouchGestureHandler({
  minSwipeDistance: 50,
  maxTapDuration: 200,
});

element.addEventListener('touchstart', (e) => gestureHandler.handleTouchStart(e));
element.addEventListener('touchmove', (e) => gestureHandler.handleTouchMove(e));
element.addEventListener('touchend', (e) => {
  const result = gestureHandler.handleTouchEnd(e);
  if (result && 'direction' in result) {
    console.log('Swipe detected:', result.direction);
  }
});

// Simple swipe handler
const swipeHandler = new SwipeHandler(element, (swipe) => {
  console.log(`Swiped ${swipe.direction} with velocity ${swipe.velocity}`);
});

// Check if device supports touch
if (isTouchDevice()) {
  // Enable touch-specific features
}
```

### 2. Responsive Utilities (`responsive.ts`)

Breakpoint utilities, media query helpers, and viewport detection.

#### Key Features

- **Breakpoint Detection**: Standard breakpoints (xs, sm, md, lg, xl, xxl)
- **Media Query Helpers**: React to viewport changes
- **Device Type Detection**: Mobile, tablet, desktop
- **Responsive Images**: Adaptive image loading
- **CSS Unit Conversion**: px to vw/vh and vice versa
- **Safe Area Insets**: Support for notched devices
- **Container Queries**: Observe container size changes

#### Usage

```typescript
import {
  getViewportInfo,
  isMobile,
  MediaQueryHelper,
  getResponsiveImageSrc,
} from '@/shared/utils/mobile';

// Get current viewport information
const viewport = getViewportInfo();
console.log(viewport.screenSize); // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
console.log(viewport.orientation); // 'portrait' | 'landscape'

// Check device type
if (isMobile()) {
  // Show mobile layout
}

// Media query listener
const mediaQuery = new MediaQueryHelper();
const unsubscribe = mediaQuery.onBreakpoint('md', (matches) => {
  console.log('Medium breakpoint:', matches);
});

// Responsive images
const imageSrc = getResponsiveImageSrc({
  xs: '/images/hero-mobile.jpg',
  md: '/images/hero-tablet.jpg',
  lg: '/images/hero-desktop.jpg',
}, '/images/hero-default.jpg');

// Viewport change listener
mediaQuery.onViewportChange((info) => {
  console.log('Viewport changed:', info);
});
```

### 3. Performance Utilities (`performance.ts`)

Network monitoring, adaptive loading, and battery optimization.

#### Key Features

- **Network Monitoring**: Detect connection speed and type
- **Battery Monitoring**: Track battery level and charging status
- **Adaptive Loading**: Load content based on network/device capabilities
- **Lazy Loading**: Intelligent lazy loading with intersection observer
- **Performance Metrics**: Collect Web Vitals (FCP, LCP, FID, CLS)
- **Resource Prefetching**: Smart prefetch based on network conditions
- **Device Capabilities**: Detect device memory and CPU cores

#### Usage

```typescript
import {
  NetworkMonitor,
  BatteryMonitor,
  LazyLoadManager,
  loadAdaptiveImage,
  getDeviceTier,
} from '@/shared/utils/mobile';

// Monitor network connection
const networkMonitor = NetworkMonitor.getInstance();
const unsubscribe = networkMonitor.subscribe((info) => {
  console.log('Network:', info.effectiveType, info.downlink);
  
  if (networkMonitor.isSlowConnection()) {
    // Enable data saver mode
  }
});

// Monitor battery
const batteryMonitor = BatteryMonitor.getInstance();
batteryMonitor.subscribe((info) => {
  console.log('Battery:', `${info.level * 100}%`, info.charging);
  
  if (batteryMonitor.isLowBattery()) {
    // Enable power saving mode
  }
});

// Adaptive image loading
const imageSrc = await loadAdaptiveImage({
  lowQuality: '/images/hero-low.jpg',
  mediumQuality: '/images/hero-medium.jpg',
  highQuality: '/images/hero-high.jpg',
  placeholder: '/images/hero-placeholder.jpg',
});

// Lazy loading
const lazyLoader = new LazyLoadManager();
document.querySelectorAll('img[data-src]').forEach((img) => {
  lazyLoader.observe(img as HTMLElement);
});

// Device capabilities
const tier = getDeviceTier(); // 'low' | 'medium' | 'high'
if (tier === 'low') {
  // Reduce animations and effects
}
```

## Integration with Existing Code

These utilities are designed to replace and consolidate functionality from:

- `client/src/lib/mobile-excellence.ts`
- `client/src/lib/mobile-optimization.ts`
- `client/src/lib/mobile-performance.ts`

### Migration Path

1. Import utilities from `@/shared/utils/mobile` instead of from `/lib`
2. Replace `MobileOptimizer.getInstance()` with specific utility classes
3. Update event listeners to use the new API
4. Test mobile functionality thoroughly

### Example Migration

**Before:**
```typescript
import { MobileOptimizer } from '@/lib/mobile-optimization';

const optimizer = MobileOptimizer.getInstance();
optimizer.initialize();
const deviceInfo = optimizer.getDeviceInfo();
```

**After:**
```typescript
import { getViewportInfo, isMobile } from '@/shared/utils/mobile';

const viewport = getViewportInfo();
if (isMobile()) {
  // Mobile-specific logic
}
```

## Best Practices

1. **Lazy Initialize**: Only initialize monitors when needed to save resources
2. **Clean Up**: Always unsubscribe from event listeners when components unmount
3. **Debounce/Throttle**: Use provided utilities for performance-sensitive operations
4. **Responsive First**: Design mobile-first, then enhance for larger screens
5. **Test on Real Devices**: Emulators don't capture real touch behavior

## Browser Support

- **Touch Events**: All modern mobile browsers
- **Network Information API**: Chrome 61+, Edge 79+, Opera 48+
- **Battery Status API**: Chrome 38+, Opera 25+ (deprecated in some browsers)
- **Intersection Observer**: All modern browsers
- **ResizeObserver**: All modern browsers

Fallbacks are provided for older browsers where possible.

## Performance Considerations

- Touch event listeners use `{ passive: true }` where possible
- Media query listeners are debounced to prevent excessive updates
- Lazy loading reduces initial page load
- Network-based adaptive loading saves bandwidth
- Battery monitoring enables power-saving features

## Contributing

When adding new mobile utilities:

1. Keep modules focused and single-purpose
2. Provide TypeScript types for all public APIs
3. Add JSDoc comments for documentation
4. Include usage examples in this README
5. Ensure backward compatibility when possible

## Related Documentation

- [Touch Events Specification](https://www.w3.org/TR/touch-events/)
- [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
- [Web Vitals](https://web.dev/vitals/)
- [Responsive Design](https://web.dev/responsive-web-design-basics/)
