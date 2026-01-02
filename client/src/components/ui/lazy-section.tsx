import React, { useState, useEffect, useRef, Suspense } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
}

const DefaultFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

export function LazySection({ 
  children, 
  fallback = <DefaultFallback />,
  rootMargin = '200px',
  threshold = 0
}: LazySectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin, threshold }
      );

      observer.observe(element);
      return () => observer.disconnect();
    } else {
      setIsVisible(true);
    }
  }, [rootMargin, threshold]);

  return (
    <div ref={ref}>
      {isVisible ? (
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}

export default LazySection;
