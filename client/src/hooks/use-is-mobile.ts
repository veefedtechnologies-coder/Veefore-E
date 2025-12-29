import { useState, useEffect } from 'react';

// Ultra-fast mobile detection - no state updates, immediate value
const getIsMobileStatic = () => typeof window !== 'undefined' && window.innerWidth < 768;

export const useIsMobile = () => {
    // Use static value for initial render to prevent flash
    const [isMobile, setIsMobile] = useState(getIsMobileStatic);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return isMobile;
};
