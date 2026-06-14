/**
 * Unit tests for MobileOptimizationService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MobileOptimizationService,
  mobileOptimizationService,
  BREAKPOINTS,
} from './MobileOptimizationService';

describe('MobileOptimizationService', () => {
  let service: MobileOptimizationService;

  beforeEach(() => {
    service = MobileOptimizationService.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MobileOptimizationService.getInstance();
      const instance2 = MobileOptimizationService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should export singleton instance', () => {
      expect(mobileOptimizationService).toBe(service);
    });
  });

  describe('Device Detection', () => {
    it('should detect device information', () => {
      const deviceInfo = service.detectDevice();
      
      expect(deviceInfo).toHaveProperty('isMobile');
      expect(deviceInfo).toHaveProperty('isTablet');
      expect(deviceInfo).toHaveProperty('isDesktop');
      expect(deviceInfo).toHaveProperty('isIOS');
      expect(deviceInfo).toHaveProperty('isAndroid');
      expect(deviceInfo).toHaveProperty('orientation');
      expect(deviceInfo).toHaveProperty('screenSize');
      expect(deviceInfo).toHaveProperty('touchSupport');
      expect(deviceInfo).toHaveProperty('os');
      expect(deviceInfo).toHaveProperty('browser');
    });

    it('should return cached device info', () => {
      const first = service.getDeviceInfo();
      const second = service.getDeviceInfo();
      
      expect(first).toBe(second);
    });

    it('should refresh device info', () => {
      const first = service.getDeviceInfo();
      const refreshed = service.refreshDeviceInfo();
      
      // Should be different objects
      expect(first).not.toBe(refreshed);
      // But same values (unless window size changed)
      expect(first.isMobile).toBe(refreshed.isMobile);
    });

    it('should provide convenience methods for device type', () => {
      const deviceInfo = service.getDeviceInfo();
      
      expect(service.isMobile()).toBe(deviceInfo.isMobile);
      expect(service.isTablet()).toBe(deviceInfo.isTablet);
      expect(service.isDesktop()).toBe(deviceInfo.isDesktop);
      expect(service.isIOS()).toBe(deviceInfo.isIOS);
      expect(service.isAndroid()).toBe(deviceInfo.isAndroid);
    });
  });

  describe('Responsive Breakpoints', () => {
    it('should have defined breakpoints', () => {
      expect(BREAKPOINTS).toHaveLength(5);
      expect(BREAKPOINTS.map(bp => bp.name)).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
    });

    it('should get screen size category', () => {
      const screenSize = service.getScreenSizeCategory(500);
      expect(screenSize).toBe('xs');
      
      const screenSizeSm = service.getScreenSizeCategory(700);
      expect(screenSizeSm).toBe('sm');
      
      const screenSizeMd = service.getScreenSizeCategory(900);
      expect(screenSizeMd).toBe('md');
      
      const screenSizeLg = service.getScreenSizeCategory(1100);
      expect(screenSizeLg).toBe('lg');
      
      const screenSizeXl = service.getScreenSizeCategory(1300);
      expect(screenSizeXl).toBe('xl');
    });

    it('should match breakpoint', () => {
      const currentSize = service.getCurrentScreenSize();
      expect(service.matchesBreakpoint(currentSize)).toBe(true);
    });

    it('should check if breakpoint or larger', () => {
      // At 1300px (xl), should be larger than all others
      expect(service.isBreakpointOrLarger('xs')).toBe(true);
      expect(service.isBreakpointOrLarger('sm')).toBe(true);
    });

    it('should get breakpoint configuration', () => {
      const xsBreakpoint = service.getBreakpoint('xs');
      expect(xsBreakpoint).toBeDefined();
      expect(xsBreakpoint?.minWidth).toBe(0);
      expect(xsBreakpoint?.maxWidth).toBe(575);
    });

    it('should get all breakpoints', () => {
      const allBreakpoints = service.getAllBreakpoints();
      expect(allBreakpoints).toHaveLength(5);
      expect(allBreakpoints).toEqual(BREAKPOINTS);
    });
  });

  describe('Touch Event Handling', () => {
    it('should setup touch handlers and return cleanup function', () => {
      const element = document.createElement('div');
      const handlers = {
        onTap: vi.fn(),
        onSwipe: vi.fn(),
      };

      const cleanup = service.setupTouchHandlers(element, handlers);
      
      expect(typeof cleanup).toBe('function');
      
      // Cleanup should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('should calculate distance between touch points', () => {
      const touch1 = { clientX: 0, clientY: 0 } as Touch;
      const touch2 = { clientX: 3, clientY: 4 } as Touch;
      
      // Using private method via any to test
      const distance = (service as any).calculateDistance(touch1, touch2);
      expect(distance).toBe(5); // 3-4-5 triangle
    });

    it('should optimize touch targets', () => {
      const container = document.createElement('div');
      const button = document.createElement('button');
      button.style.width = '20px';
      button.style.height = '20px';
      container.appendChild(button);
      
      service.optimizeTouchTargets(container);
      
      // Should have min sizes applied
      expect(button.style.minWidth).toBeTruthy();
      expect(button.style.minHeight).toBeTruthy();
    });
  });

  describe('Viewport and Orientation', () => {
    it('should get current orientation', () => {
      const orientation = service.getOrientation();
      expect(['portrait', 'landscape']).toContain(orientation);
    });

    it('should setup orientation change listener', () => {
      const callback = vi.fn();
      const cleanup = service.onOrientationChange(callback);
      
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should setup screen size change listener', () => {
      const callback = vi.fn();
      const cleanup = service.onScreenSizeChange(callback);
      
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  describe('CSS and Styling', () => {
    it('should apply mobile classes to body', () => {
      service.applyMobileClasses();
      
      const body = document.body;
      const deviceInfo = service.getDeviceInfo();
      
      // Should have screen size class
      expect(body.classList.contains(deviceInfo.screenSize)).toBe(true);
      
      // Should have orientation class
      expect(body.classList.contains(deviceInfo.orientation)).toBe(true);
    });

    it('should inject mobile CSS only once', () => {
      service.injectMobileCSS();
      const firstStyle = document.getElementById('mobile-optimization-styles');
      expect(firstStyle).toBeTruthy();
      
      service.injectMobileCSS();
      const styles = document.querySelectorAll('#mobile-optimization-styles');
      expect(styles.length).toBe(1); // Should not duplicate
    });
  });

  describe('Utility Methods', () => {
    it('should get pixel ratio', () => {
      const ratio = service.getPixelRatio();
      expect(typeof ratio).toBe('number');
      expect(ratio).toBeGreaterThan(0);
    });

    it('should check if device supports hover', () => {
      const supportsHover = service.supportsHover();
      expect(typeof supportsHover).toBe('boolean');
    });

    it('should check if reduced motion is preferred', () => {
      const prefersReduced = service.prefersReducedMotion();
      expect(typeof prefersReduced).toBe('boolean');
    });

    it('should check if dark mode is preferred', () => {
      const prefersDark = service.prefersDarkMode();
      expect(typeof prefersDark).toBe('boolean');
    });

    it('should check if device is standalone (PWA)', () => {
      const isStandalone = service.isStandalone();
      expect(typeof isStandalone).toBe('boolean');
    });

    it('should get safe area insets', () => {
      const insets = service.getSafeAreaInsets();
      expect(insets).toHaveProperty('top');
      expect(insets).toHaveProperty('right');
      expect(insets).toHaveProperty('bottom');
      expect(insets).toHaveProperty('left');
    });
  });
});
