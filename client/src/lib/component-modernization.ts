/**
 * P7.7: Component Modernization System
 * 
 * Advanced React patterns and performance optimizations
 * for modern component architecture targeting ≥90 Lighthouse scores
 */

import { useMemo, useCallback, useState, useEffect } from 'react';

/**
 * P7.7: Performance Hook for Expensive Calculations
 */
export function useOptimizedMemo<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  return useMemo(() => {
    const result = factory();
    console.log('🧮 P7.7: Expensive calculation memoized');
    return result;
  }, deps);
}

/**
 * P7.7: Optimized Callback Hook
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps);
}

/**
 * P7.7: Component Performance Monitor
 */
export class ComponentPerformanceMonitor {
  private static renderTimes = new Map<string, number[]>();
  private static slowComponents = new Set<string>();

  /**
   * Track component render performance
   */
  static trackRenderTime(componentName: string, renderTime: number): void {
    if (!this.renderTimes.has(componentName)) {
      this.renderTimes.set(componentName, []);
    }

    const times = this.renderTimes.get(componentName)!;
    times.push(renderTime);

    // Keep only last 10 renders
    if (times.length > 10) {
      times.shift();
    }

    // Calculate average
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    // Flag slow components (>16ms average)
    if (avgTime > 16 && !this.slowComponents.has(componentName)) {
      this.slowComponents.add(componentName);
      console.warn(`🐌 P7.7: Slow component detected: ${componentName} (${avgTime.toFixed(2)}ms avg)`);
    }
  }

  /**
   * Get performance report
   */
  static getPerformanceReport(): { [componentName: string]: { avgRenderTime: number; renderCount: number } } {
    const report: { [componentName: string]: { avgRenderTime: number; renderCount: number } } = {};

    this.renderTimes.forEach((times, componentName) => {
      report[componentName] = {
        avgRenderTime: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100,
        renderCount: times.length
      };
    });

    return report;
  }
}

/**
 * P7.7: Performance Monitoring Hook
 */
export function useComponentPerformance(componentName: string) {
  const startTime = useMemo(() => performance.now(), []);

  useEffect(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    ComponentPerformanceMonitor.trackRenderTime(componentName, renderTime);
  });
}

/**
 * P7.7: Virtual Scroll Hook for Large Lists
 */
export function useVirtualScroll<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleItems = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      startIndex,
      endIndex,
      items: items.slice(startIndex, endIndex),
      offsetY: startIndex * itemHeight,
      totalHeight: items.length * itemHeight
    };
  }, [items, scrollTop, containerHeight, itemHeight, overscan]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    handleScroll,
    containerProps: {
      style: { height: containerHeight, overflow: 'auto' as const },
      onScroll: handleScroll
    }
  };
}

/**
 * P7.7: Performance Optimizations
 */
export class PerformanceOptimizer {
  /**
   * Optimize images for better performance
   */
  static optimizeImages(): void {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.hasAttribute('loading')) {
        img.loading = 'lazy';
      }
      if (!img.hasAttribute('decoding')) {
        img.decoding = 'async';
      }
    });

    console.log('🖼️ P7.7: Optimized', images.length, 'images');
  }

  /**
   * Add performance optimizations
   */
  static addPerformanceHints(): void {
    // Add resource hints for critical resources
    const hints = [
      { rel: 'dns-prefetch', href: '//fonts.googleapis.com' },
      { rel: 'dns-prefetch', href: '//api.openai.com' },
      { rel: 'preconnect', href: '//fonts.gstatic.com', crossorigin: '' }
    ];

    hints.forEach(hint => {
      const existing = document.querySelector(`link[href="${hint.href}"]`);
      if (!existing) {
        const link = document.createElement('link');
        link.rel = hint.rel;
        link.href = hint.href;
        if (hint.crossorigin) link.crossOrigin = hint.crossorigin;
        document.head.appendChild(link);
      }
    });

    console.log('🔗 P7.7: Added performance hints');
  }
}

/**
 * P7.7: Initialize component modernization system
 */
export function initializeComponentModernization(): void {
  // Setup component performance monitoring
  ComponentPerformanceMonitor.trackRenderTime('App', performance.now());

  // Optimize existing images
  PerformanceOptimizer.optimizeImages();

  // Add performance hints
  PerformanceOptimizer.addPerformanceHints();

  // Monitor large lists for virtualization opportunities
  const largeContainers = document.querySelectorAll('[data-list-size]');
  largeContainers.forEach(container => {
    const size = parseInt(container.getAttribute('data-list-size') || '0');
    if (size > 50) {
      console.log(`📊 P7.7: Large list detected (${size} items), consider virtualization:`, container);
    }
  });

  console.log('🔧 P7.7: Component modernization system initialized');
}