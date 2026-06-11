import { useState, useEffect } from 'react';
import { useIsMobile } from './use-is-mobile';

/**
 * Hook to detect user motion preferences and device capabilities
 * 
 * Returns:
 * - isMobile: Whether the device is mobile (< 768px)
 * - prefersReducedMotion: Whether user prefers reduced motion
 * - shouldSimplifyAnimations: Combined flag for when animations should be simplified
 * - shouldDisable3D: Whether 3D transforms should be disabled
 * - shouldDisableHeavyEffects: Whether heavy effects (parallax, orbs) should be simplified
 * 
 * Requirements: 5.4, 6.4
 * Task 7.2: Mobile animation optimization
 */
export const useMotionPreferences = () => {
  const isMobile = useIsMobile();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } 
    // Fallback for older browsers
    else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return {
    isMobile,
    prefersReducedMotion,
    shouldSimplifyAnimations: isMobile || prefersReducedMotion,
    shouldDisable3D: isMobile || prefersReducedMotion,
    shouldDisableHeavyEffects: isMobile || prefersReducedMotion,
  };
};
