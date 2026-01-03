import React, { useState, useEffect, useRef, Suspense } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
  minHeight?: string;
}

/**
 * LazySection - SIMPLIFIED: Pure CSS visibility control.
 * 
 * CRITICAL RULES TO PREVENT FLICKERING:
 * 1. Children are ALWAYS rendered immediately - no conditional rendering
 * 2. Only CSS opacity is used for fade-in effect
 * 3. No spinners or fallback elements that could cause layout shifts
 * 4. Uses content-visibility: auto for browser optimization
 * 
 * The component only controls opacity to create a fade-in effect when
 * the section enters the viewport. This prevents:
 * - Layout thrashing (reflow/repaint)
 * - Component unmounting/remounting
 * - Height calculation issues
 */
export function LazySection({
  children,
  rootMargin = '200px',
  threshold = 0,
  minHeight = '50vh'
}: LazySectionProps) {
  const [hasEntered, setHasEntered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setHasEntered(true);
            observer.disconnect(); // One-time trigger
          }
        },
        { rootMargin, threshold }
      );

      observer.observe(element);
      return () => observer.disconnect();
    } else {
      // Fallback for browsers without IntersectionObserver
      setHasEntered(true);
    }
  }, [rootMargin, threshold]);

  return (
    <div
      ref={ref}
      style={{
        // Browser-level optimization - skips rendering for off-screen content
        contentVisibility: 'auto',
        containIntrinsicSize: `1px ${minHeight}`,
      }}
    >
      {/* ALWAYS render children - only opacity changes */}
      <div
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: 'opacity 0.5s ease-out',
          // GPU acceleration for smooth transition
          transform: 'translateZ(0)',
          willChange: hasEntered ? 'auto' : 'opacity',
        }}
      >
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}

export default LazySection;


