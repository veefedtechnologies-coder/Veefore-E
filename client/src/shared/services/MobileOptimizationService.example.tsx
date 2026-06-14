/**
 * Example usage of MobileOptimizationService
 * 
 * This file demonstrates how to use the mobile optimization service
 * in various scenarios.
 */

import React, { useEffect, useRef } from 'react';
import {
  mobileOptimizationService,
  initializeMobileOptimization,
  useDeviceInfo,
  useIsMobile,
  useScreenSize,
  useBreakpoint,
  useTouchGestures,
  useOrientation,
  type TouchGesture,
} from './MobileOptimizationService';

// ============================================================================
// Example 1: Initialize at App Startup
// ============================================================================

export function AppInitialization() {
  useEffect(() => {
    // Initialize mobile optimization when app starts
    initializeMobileOptimization({
      applyClasses: true,
      injectCSS: true,
      setupViewport: true,
      optimizeTouchTargets: true,
    });
  }, []);

  return null;
}

// ============================================================================
// Example 2: Device Detection
// ============================================================================

export function DeviceDetectionExample() {
  const deviceInfo = useDeviceInfo();

  return (
    <div>
      <h2>Device Information</h2>
      <ul>
        <li>Type: {deviceInfo.isMobile ? 'Mobile' : deviceInfo.isTablet ? 'Tablet' : 'Desktop'}</li>
        <li>OS: {deviceInfo.os} {deviceInfo.osVersion}</li>
        <li>Browser: {deviceInfo.browser} {deviceInfo.browserVersion}</li>
        <li>Screen Size: {deviceInfo.screenSize}</li>
        <li>Orientation: {deviceInfo.orientation}</li>
        <li>Touch Support: {deviceInfo.touchSupport ? 'Yes' : 'No'}</li>
        <li>Pixel Ratio: {deviceInfo.pixelRatio}</li>
      </ul>
    </div>
  );
}

// ============================================================================
// Example 3: Responsive Component
// ============================================================================

export function ResponsiveComponent() {
  const isMobile = useIsMobile();
  const screenSize = useScreenSize();
  const isLargeScreen = useBreakpoint('lg');

  return (
    <div>
      {isMobile ? (
        <MobileLayout />
      ) : (
        <DesktopLayout />
      )}
      
      <p>Current screen size: {screenSize}</p>
      {isLargeScreen && <LargeScreenFeatures />}
    </div>
  );
}

// ============================================================================
// Example 4: Touch Gesture Handling
// ============================================================================

export function TouchGestureExample() {
  const elementRef = useTouchGestures({
    onTap: (event) => {
      console.log('Tapped!', event);
    },
    onSwipe: (gesture: TouchGesture) => {
      console.log('Swiped!', gesture.direction, gesture.distance);
    },
    onPinch: (gesture: TouchGesture) => {
      console.log('Pinched!', gesture.scale);
    },
    onLongPress: (event) => {
      console.log('Long pressed!', event);
    },
  });

  return (
    <div ref={elementRef} style={{ padding: '20px', border: '1px solid #ccc' }}>
      Try swiping, tapping, or long pressing on this area
    </div>
  );
}

// ============================================================================
// Example 5: Orientation Handling
// ============================================================================

export function OrientationExample() {
  const orientation = useOrientation();

  return (
    <div>
      <p>Current orientation: {orientation}</p>
      {orientation === 'portrait' ? (
        <PortraitContent />
      ) : (
        <LandscapeContent />
      )}
    </div>
  );
}

// ============================================================================
// Example 6: Direct Service Usage (Non-React)
// ============================================================================

export function directServiceUsage() {
  // Get device information
  const deviceInfo = mobileOptimizationService.getDeviceInfo();
  console.log('Device:', deviceInfo);

  // Check specific device types
  if (mobileOptimizationService.isMobile()) {
    console.log('This is a mobile device');
  }

  if (mobileOptimizationService.isIOS()) {
    console.log('This is an iOS device');
  }

  // Check screen size
  const screenSize = mobileOptimizationService.getCurrentScreenSize();
  console.log('Screen size:', screenSize);

  // Check breakpoints
  if (mobileOptimizationService.isBreakpointOrLarger('md')) {
    console.log('Screen is medium or larger');
  }

  // Setup touch handlers on an element
  const element = document.getElementById('my-element');
  if (element) {
    const cleanup = mobileOptimizationService.setupTouchHandlers(element, {
      onTap: () => console.log('Tapped'),
      onSwipe: (gesture) => console.log('Swiped', gesture.direction),
    });

    // Later, cleanup
    // cleanup();
  }

  // Listen to orientation changes
  const cleanupOrientation = mobileOptimizationService.onOrientationChange((orientation) => {
    console.log('Orientation changed to:', orientation);
  });

  // Listen to screen size changes
  const cleanupScreenSize = mobileOptimizationService.onScreenSizeChange((size) => {
    console.log('Screen size changed to:', size);
  });

  // Cleanup listeners
  // cleanupOrientation();
  // cleanupScreenSize();
}

// ============================================================================
// Example 7: Conditional Rendering Based on Screen Size
// ============================================================================

export function ConditionalRenderingExample() {
  const screenSize = useScreenSize();

  const getColumnsCount = () => {
    switch (screenSize) {
      case 'xs': return 1;
      case 'sm': return 2;
      case 'md': return 3;
      case 'lg': return 4;
      case 'xl': return 5;
      default: return 3;
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${getColumnsCount()}, 1fr)` }}>
      {/* Content grid items */}
    </div>
  );
}

// ============================================================================
// Dummy components for examples
// ============================================================================

function MobileLayout() {
  return <div>Mobile Layout</div>;
}

function DesktopLayout() {
  return <div>Desktop Layout</div>;
}

function LargeScreenFeatures() {
  return <div>Large Screen Features</div>;
}

function PortraitContent() {
  return <div>Portrait Content</div>;
}

function LandscapeContent() {
  return <div>Landscape Content</div>;
}
