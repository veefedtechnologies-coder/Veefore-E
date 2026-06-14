# Mobile Optimization Service

## Overview

The `MobileOptimizationService` is a consolidated service that provides mobile-specific functionality for device detection, responsive breakpoint calculations, and touch event handling. It consolidates functionality from three legacy mobile libraries:

- `mobile-excellence.ts` (714 lines)
- `mobile-optimization.ts` (665 lines)  
- `mobile-performance.ts` (640 lines)

**Requirements:** 23.2, 23.3, 23.4

## Features

### 1. Device Detection (Requirement 23.2)

Comprehensive device detection including:
- Device type (mobile, tablet, desktop)
- Operating system (iOS, Android, Windows, macOS, Linux)
- OS version
- Browser (Safari, Chrome, Firefox, Edge, Opera)
- Browser version
- Touch support
- Pixel ratio
- Viewport dimensions
- Orientation (portrait/landscape)
- Screen size category (xs, sm, md, lg, xl)

### 2. Responsive Breakpoint Calculations (Requirement 23.3)

Standard breakpoint definitions:
- **xs**: 0-575px
- **sm**: 576-767px
- **md**: 768-991px
- **lg**: 992-1199px
- **xl**: 1200px+

Utilities for:
- Getting current screen size category
- Checking if viewport matches a breakpoint
- Checking if viewport is at or above/below a breakpoint
- Listening to screen size changes

### 3. Touch Event Handling (Requirement 23.4)

Comprehensive touch gesture detection:
- **Tap**: Single tap/click
- **Swipe**: Directional swipe (up, down, left, right)
- **Pinch**: Two-finger pinch with scale
- **Rotate**: Two-finger rotation
- **Long Press**: Touch and hold

Additional touch utilities:
- Touch target size optimization (44px minimum)
- Preventing default touch behaviors
- Multi-touch gesture support

## Installation

The service is already available in the project. Import it:

```typescript
import {
  mobileOptimizationService,
  initializeMobileOptimization,
  useDeviceInfo,
  useIsMobile,
  useScreenSize,
  // ... other exports
} from '@/shared/services/MobileOptimizationService';
```

## Usage

### Initialization

Call once at app startup:

```typescript
import { initializeMobileOptimization } from '@/shared/services/MobileOptimizationService';

// In your app root (e.g., App.tsx, main.tsx)
initializeMobileOptimization({
  applyClasses: true,        // Apply device-specific CSS classes to body
  injectCSS: true,           // Inject mobile optimization styles
  setupViewport: true,       // Setup viewport meta tag
  optimizeTouchTargets: true // Optimize touch target sizes
});
```

### React Hooks

#### Device Detection

```typescript
import { useDeviceInfo, useIsMobile } from '@/shared/services/MobileOptimizationService';

function MyComponent() {
  const deviceInfo = useDeviceInfo();
  const isMobile = useIsMobile();

  return (
    <div>
      {isMobile ? <MobileView /> : <DesktopView />}
      <p>OS: {deviceInfo.os}</p>
    </div>
  );
}
```

#### Responsive Breakpoints

```typescript
import { useScreenSize, useBreakpoint } from '@/shared/services/MobileOptimizationService';

function ResponsiveGrid() {
  const screenSize = useScreenSize();
  const isLarge = useBreakpoint('lg');

  const columns = {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
  }[screenSize];

  return <Grid columns={columns}>...</Grid>;
}
```

#### Touch Gestures

```typescript
import { useTouchGestures } from '@/shared/services/MobileOptimizationService';

function SwipeableCard() {
  const ref = useTouchGestures({
    onSwipe: (gesture) => {
      if (gesture.direction === 'left') {
        navigateNext();
      } else if (gesture.direction === 'right') {
        navigatePrev();
      }
    },
    onLongPress: () => {
      showContextMenu();
    }
  });

  return <div ref={ref}>Swipeable content</div>;
}
```

#### Orientation

```typescript
import { useOrientation } from '@/shared/services/MobileOptimizationService';

function OrientationAware() {
  const orientation = useOrientation();

  return (
    <div>
      {orientation === 'portrait' ? (
        <PortraitLayout />
      ) : (
        <LandscapeLayout />
      )}
    </div>
  );
}
```

### Direct Service Usage (Non-React)

```typescript
import { mobileOptimizationService } from '@/shared/services/MobileOptimizationService';

// Get device info
const device = mobileOptimizationService.getDeviceInfo();

// Check device type
if (mobileOptimizationService.isMobile()) {
  console.log('Mobile device detected');
}

// Check screen size
const screenSize = mobileOptimizationService.getCurrentScreenSize();

// Listen to changes
const cleanup = mobileOptimizationService.onOrientationChange((orientation) => {
  console.log('Orientation:', orientation);
});
```

## API Reference

See `MobileOptimizationService.example.tsx` for comprehensive usage examples.

### Core Methods

- `detectDevice()`: Detect and return device information
- `getDeviceInfo()`: Get cached device info
- `refreshDeviceInfo()`: Refresh device detection
- `isMobile()`: Check if mobile
- `isTablet()`: Check if tablet
- `isIOS()`: Check if iOS
- `isAndroid()`: Check if Android

### Breakpoint Methods

- `getScreenSizeCategory(width?)`: Get screen size category
- `getCurrentScreenSize()`: Get current screen size
- `matchesBreakpoint(breakpoint)`: Check if matches breakpoint
- `isBreakpointOrLarger(breakpoint)`: Check if at or above breakpoint
- `getBreakpoint(name)`: Get breakpoint configuration

### Touch Methods

- `setupTouchHandlers(element, handlers)`: Setup touch event handlers
- `optimizeTouchTargets(container?)`: Optimize touch target sizes
- `preventDefaultTouchBehaviors(element)`: Prevent default touch behaviors

### Utility Methods

- `getOrientation()`: Get current orientation
- `onOrientationChange(callback)`: Listen to orientation changes
- `onScreenSizeChange(callback)`: Listen to screen size changes
- `getPixelRatio()`: Get device pixel ratio
- `supportsHover()`: Check if hover is supported
- `prefersReducedMotion()`: Check if reduced motion is preferred
- `prefersDarkMode()`: Check if dark mode is preferred
- `isStandalone()`: Check if running as PWA
- `getSafeAreaInsets()`: Get iOS safe area insets

## Migration Guide

### From `use-is-mobile.ts`

**Before:**
```typescript
import { useIsMobile } from '@/hooks/use-is-mobile';
const isMobile = useIsMobile();
```

**After:**
```typescript
import { useIsMobile } from '@/shared/services/MobileOptimizationService';
const isMobile = useIsMobile();
```

### From `mobile-optimization.ts`

**Before:**
```typescript
import { MobileOptimizer } from '@/lib/mobile-optimization';
const optimizer = MobileOptimizer.getInstance();
const deviceInfo = optimizer.getDeviceInfo();
```

**After:**
```typescript
import { mobileOptimizationService } from '@/shared/services/MobileOptimizationService';
const deviceInfo = mobileOptimizationService.getDeviceInfo();
```

## Testing

Unit tests are provided in `MobileOptimizationService.test.ts`. Run tests:

```bash
npm test -- MobileOptimizationService.test.ts
```

## Performance

The service uses:
- Singleton pattern for single instance
- Cached device detection
- Passive event listeners
- Debounced resize handlers (in hooks)
- Efficient touch event handling

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- iOS Safari 12+
- Android Chrome 70+
- Touch events API
- Orientation API
- Media queries

## License

Internal use only - Veefore-E project
