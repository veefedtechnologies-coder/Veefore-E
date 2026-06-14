/**
 * Example Usage of Mobile Utilities
 * 
 * This file demonstrates how to use the mobile utilities in real-world scenarios.
 * Remove or modify this file as needed for your project.
 */

import {
  // Touch handlers
  SwipeHandler,
  TouchGestureHandler,
  isTouchDevice,
  createTouchRipple,
  
  // Responsive utilities
  getViewportInfo,
  isMobile,
  MediaQueryHelper,
  getResponsiveImageSrc,
  calculateResponsiveFontSize,
  
  // Performance utilities
  NetworkMonitor,
  BatteryMonitor,
  LazyLoadManager,
  loadAdaptiveImage,
  getDeviceTier,
  debounce,
  prefersReducedMotion,
} from './index';

/**
 * Example 1: Setup swipe navigation
 */
export function setupSwipeNavigation(element: HTMLElement): () => void {
  if (!isTouchDevice()) {
    return () => {}; // No cleanup needed
  }

  const swipeHandler = new SwipeHandler(element, (swipe) => {
    switch (swipe.direction) {
      case 'left':
        console.log('Navigate to next page');
        break;
      case 'right':
        console.log('Navigate to previous page');
        break;
      case 'up':
        console.log('Scroll down');
        break;
      case 'down':
        console.log('Scroll up');
        break;
    }
  });

  // Return cleanup function
  return () => {
    swipeHandler.destroy();
  };
}

/**
 * Example 2: Adaptive layout based on viewport
 */
export function setupResponsiveLayout(): () => void {
  const mediaQuery = new MediaQueryHelper();

  // Listen for breakpoint changes
  const unsubscribe = mediaQuery.onViewportChange((viewport) => {
    console.log('Viewport changed:', viewport);

    // Update layout based on device type
    if (viewport.deviceType === 'mobile') {
      document.body.classList.add('mobile-layout');
      document.body.classList.remove('tablet-layout', 'desktop-layout');
    } else if (viewport.deviceType === 'tablet') {
      document.body.classList.add('tablet-layout');
      document.body.classList.remove('mobile-layout', 'desktop-layout');
    } else {
      document.body.classList.add('desktop-layout');
      document.body.classList.remove('mobile-layout', 'tablet-layout');
    }

    // Update orientation classes
    document.body.classList.toggle('portrait', viewport.orientation === 'portrait');
    document.body.classList.toggle('landscape', viewport.orientation === 'landscape');
  });

  return unsubscribe;
}

/**
 * Example 3: Network-aware content loading
 */
export function setupNetworkAwareLoading(): () => void {
  const networkMonitor = NetworkMonitor.getInstance();

  const unsubscribe = networkMonitor.subscribe((network) => {
    console.log('Network status:', network);

    // Adjust content quality based on connection
    if (networkMonitor.isSlowConnection()) {
      document.body.classList.add('low-bandwidth');
      console.log('Enabling data saver mode');
      
      // Disable auto-play videos
      document.querySelectorAll('video[autoplay]').forEach((video) => {
        (video as HTMLVideoElement).pause();
      });
    } else {
      document.body.classList.remove('low-bandwidth');
      console.log('Normal bandwidth mode');
    }

    // Update UI to show network status
    const networkIndicator = document.getElementById('network-status');
    if (networkIndicator) {
      networkIndicator.textContent = network.effectiveType.toUpperCase();
      networkIndicator.className = `network-${network.effectiveType}`;
    }
  });

  return unsubscribe;
}

/**
 * Example 4: Battery-aware performance optimization
 */
export function setupBatteryOptimization(): () => void {
  const batteryMonitor = BatteryMonitor.getInstance();

  const unsubscribe = batteryMonitor.subscribe((battery) => {
    console.log('Battery status:', battery);

    if (batteryMonitor.isLowBattery()) {
      console.log('Enabling power saving mode');
      document.body.classList.add('power-saving');

      // Reduce animation duration
      const style = document.createElement('style');
      style.id = 'power-saving-styles';
      style.textContent = `
        * {
          animation-duration: 0.1s !important;
          transition-duration: 0.1s !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      document.body.classList.remove('power-saving');
      const powerSavingStyles = document.getElementById('power-saving-styles');
      if (powerSavingStyles) {
        powerSavingStyles.remove();
      }
    }
  });

  return unsubscribe;
}

/**
 * Example 5: Lazy load images with adaptive quality
 */
export function setupAdaptiveImageLoading(): void {
  const lazyLoader = new LazyLoadManager();

  // Find all images with data-src attribute
  document.querySelectorAll('img[data-src]').forEach((img) => {
    lazyLoader.observe(img as HTMLElement);
  });

  // Also handle images with multiple quality options
  document.querySelectorAll('img[data-adaptive]').forEach(async (img) => {
    const element = img as HTMLImageElement;
    const basePath = element.dataset.src || '';

    const src = await loadAdaptiveImage({
      lowQuality: basePath.replace('.jpg', '-low.jpg'),
      mediumQuality: basePath.replace('.jpg', '-medium.jpg'),
      highQuality: basePath,
      placeholder: basePath.replace('.jpg', '-placeholder.jpg'),
    });

    element.src = src;
  });
}

/**
 * Example 6: Touch ripple effect on buttons
 */
export function setupTouchRipples(): void {
  if (!isTouchDevice()) {
    return;
  }

  // Add ripple effect to all buttons
  document.querySelectorAll('button, .btn').forEach((button) => {
    createTouchRipple(button as HTMLElement);
  });
}

/**
 * Example 7: Responsive font sizing
 */
export function setupResponsiveFonts(): void {
  const root = document.documentElement;

  // Calculate responsive font sizes
  const baseFontSize = calculateResponsiveFontSize(14, 18, 320, 1920);
  const headingFontSize = calculateResponsiveFontSize(24, 48, 320, 1920);

  root.style.setProperty('--font-size-base', baseFontSize);
  root.style.setProperty('--font-size-heading', headingFontSize);
}

/**
 * Example 8: Device-tier specific optimizations
 */
export function applyDeviceTierOptimizations(): void {
  const tier = getDeviceTier();

  switch (tier) {
    case 'low':
      // Reduce visual effects
      document.body.classList.add('low-end-device');
      console.log('Low-end device detected - reducing effects');
      
      // Disable animations if user prefers reduced motion
      if (prefersReducedMotion()) {
        document.body.classList.add('no-animations');
      }
      break;

    case 'high':
      // Enable advanced features
      document.body.classList.add('high-end-device');
      console.log('High-end device detected - enabling advanced features');
      break;

    default:
      document.body.classList.add('medium-end-device');
      console.log('Medium-end device detected - balanced performance');
  }
}

/**
 * Example 9: Initialize all mobile optimizations
 */
export function initializeMobileOptimizations(): () => void {
  console.log('Initializing mobile optimizations...');

  const cleanupFunctions: Array<() => void> = [];

  // Setup responsive layout
  cleanupFunctions.push(setupResponsiveLayout());

  // Setup network monitoring
  cleanupFunctions.push(setupNetworkAwareLoading());

  // Setup battery optimization
  cleanupFunctions.push(setupBatteryOptimization());

  // Setup lazy loading
  setupAdaptiveImageLoading();

  // Setup touch ripples
  setupTouchRipples();

  // Setup responsive fonts
  setupResponsiveFonts();

  // Apply device-specific optimizations
  applyDeviceTierOptimizations();

  console.log('Mobile optimizations initialized');

  // Return cleanup function
  return () => {
    console.log('Cleaning up mobile optimizations...');
    cleanupFunctions.forEach((cleanup) => cleanup());
  };
}

/**
 * Example 10: Debounced window resize handler
 */
export function setupDebouncedResize(): () => void {
  const handleResize = debounce(() => {
    const viewport = getViewportInfo();
    console.log('Window resized:', viewport);

    // Update viewport-dependent calculations
    setupResponsiveFonts();
  }, 250);

  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize);
  };
}
