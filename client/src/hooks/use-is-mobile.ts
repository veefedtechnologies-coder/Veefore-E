import { useState, useEffect, useRef } from 'react';

// Static mobile detection - evaluated once at module load
const getIsMobileStatic = () => typeof window !== 'undefined' && window.innerWidth < 768;

// Cached value to prevent re-renders during the same session
let cachedIsMobile: boolean | null = null;

export const useIsMobile = () => {
    // Initialize with cached or static value to prevent flash
    const [isMobile, setIsMobile] = useState(() => {
        if (cachedIsMobile !== null) return cachedIsMobile;
        const value = getIsMobileStatic();
        cachedIsMobile = value;
        return value;
    });

    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        // Debounced resize handler - only fires after 150ms of no resizing
        // This prevents animation resets during scroll momentum / elastic scrolling
        const handleResize = () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = window.setTimeout(() => {
                const newValue = window.innerWidth < 768;
                // Only update if value actually changed
                if (newValue !== cachedIsMobile) {
                    cachedIsMobile = newValue;
                    setIsMobile(newValue);
                }
            }, 150);
        };

        window.addEventListener('resize', handleResize, { passive: true });

        return () => {
            window.removeEventListener('resize', handleResize);
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return isMobile;
};
