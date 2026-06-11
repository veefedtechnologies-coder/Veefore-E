/**
 * useLazyLoad Hook - Landing Page Sections Redesign
 * 
 * Custom hook using IntersectionObserver for viewport detection.
 * Enables lazy loading of components when they enter the viewport.
 * Includes fallback for browsers without IntersectionObserver support.
 */

import { useState, useEffect, RefObject } from 'react';

interface UseLazyLoadOptions {
  /**
   * Intersection threshold (0-1). Percentage of element that must be visible.
   * @default 0.1
   */
  threshold?: number;

  /**
   * Root margin around the viewport (e.g., '100px' to trigger earlier).
   * @default '100px'
   */
  rootMargin?: string;

  /**
   * Whether to disconnect observer after first intersection.
   * Set to true for one-time lazy loading.
   * @default true
   */
  once?: boolean;

  /**
   * Root element for intersection observer (defaults to viewport).
   * @default null
   */
  root?: Element | null;
}

/**
 * Hook to detect when an element enters the viewport
 * 
 * @param ref - React ref object pointing to the element to observe
 * @param options - Configuration options for IntersectionObserver
 * @returns boolean indicating whether element is in viewport
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const sectionRef = useRef<HTMLDivElement>(null);
 *   const isVisible = useLazyLoad(sectionRef, { threshold: 0.2 });
 * 
 *   return (
 *     <div ref={sectionRef}>
 *       {isVisible ? <ExpensiveComponent /> : <Placeholder />}
 *     </div>
 *   );
 * };
 * ```
 */
export const useLazyLoad = (
  ref: RefObject<HTMLElement>,
  options: UseLazyLoadOptions = {}
): boolean => {
  const {
    threshold = 0.1,
    rootMargin = '100px',
    once = true,
    root = null,
  } = options;

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Fallback for browsers without IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, loading content immediately');
      setIsVisible(true);
      return;
    }

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        // Update visibility state when intersection changes
        if (entry.isIntersecting) {
          setIsVisible(true);

          // Disconnect observer if only observing once
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          // Allow visibility to toggle if not one-time only
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    // Start observing the element
    observer.observe(element);

    // Cleanup function
    return () => {
      observer.disconnect();
    };
  }, [ref, threshold, rootMargin, once, root]);

  return isVisible;
};

/**
 * Hook variant that returns both visibility state and entry object
 * Useful when you need access to intersection details
 */
export const useLazyLoadWithEntry = (
  ref: RefObject<HTMLElement>,
  options: UseLazyLoadOptions = {}
): {
  isVisible: boolean;
  entry: IntersectionObserverEntry | null;
} => {
  const {
    threshold = 0.1,
    rootMargin = '100px',
    once = true,
    root = null,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Fallback for browsers without IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, loading content immediately');
      setIsVisible(true);
      return;
    }

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        const [currentEntry] = entries;
        setEntry(currentEntry);

        // Update visibility state when intersection changes
        if (currentEntry.isIntersecting) {
          setIsVisible(true);

          // Disconnect observer if only observing once
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    // Start observing the element
    observer.observe(element);

    // Cleanup function
    return () => {
      observer.disconnect();
    };
  }, [ref, threshold, rootMargin, once, root]);

  return { isVisible, entry };
};

/**
 * Hook for progressive loading based on scroll position
 * Triggers earlier as user scrolls, good for content-heavy sections
 */
export const useProgressiveLazyLoad = (
  ref: RefObject<HTMLElement>
): boolean => {
  return useLazyLoad(ref, {
    threshold: 0.05, // Trigger with minimal visibility
    rootMargin: '200px', // Load well before entering viewport
    once: true,
  });
};

/**
 * Hook for strict lazy loading (only loads when mostly visible)
 * Good for heavy components that should only load when user really sees them
 */
export const useStrictLazyLoad = (
  ref: RefObject<HTMLElement>
): boolean => {
  return useLazyLoad(ref, {
    threshold: 0.5, // Require 50% visibility
    rootMargin: '0px', // No margin
    once: true,
  });
};

export default useLazyLoad;
