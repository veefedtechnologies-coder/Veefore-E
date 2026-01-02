import React, { useState, useEffect, useRef, Suspense } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
  minHeight?: string;
}

const DefaultFallback = ({ minHeight }: { minHeight: string }) => (
  <div 
    className="flex items-center justify-center"
    style={{ minHeight }}
  >
    <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

export function LazySection({ 
  children, 
  fallback,
  rootMargin = '200px',
  threshold = 0,
  minHeight = '50vh'
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

  const fallbackContent = fallback || <DefaultFallback minHeight={minHeight} />;

  return (
    <div ref={ref} style={{ minHeight: isVisible ? undefined : minHeight }}>
      {isVisible ? (
        <Suspense fallback={fallbackContent}>
          {children}
        </Suspense>
      ) : (
        fallbackContent
      )}
    </div>
  );
}

export default LazySection;
