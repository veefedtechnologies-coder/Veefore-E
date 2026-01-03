import React, { useState, useRef, useEffect } from 'react';

interface LazySectionProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * LazySection - Ultra-lightweight lazy loading wrapper
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * 1. NO contentVisibility (causes layout shifts on mobile)
 * 2. Simple opacity transition only
 * 3. One-time trigger - never re-observes
 * 4. GPU-accelerated transitions
 * 5. Children always in DOM - no unmounting
 */
export const LazySection: React.FC<LazySectionProps> = ({ children, className = '' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Skip if already visible (prevents any flickering on re-render)
        if (isVisible) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            {
                rootMargin: '100px',
                threshold: 0.01
            }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [isVisible]);

    return (
        <div ref={ref} className={className}>
            <div
                style={{
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 0.4s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default LazySection;
