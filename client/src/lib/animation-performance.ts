export const GPU_ACCELERATED_STYLES = {
  transform: 'translate3d(0, 0, 0)',
  // REMOVED: backfaceVisibility causes flickering on mobile with animations
  // backfaceVisibility: 'hidden' as const,
  // WebkitBackfaceVisibility: 'hidden' as const,
  perspective: '1000px',
  WebkitFontSmoothing: 'subpixel-antialiased' as const,
} as const;

export const MOBILE_OPTIMIZED_LAYER = {
  ...GPU_ACCELERATED_STYLES,
  willChange: 'transform, opacity',
  contain: 'paint layout', // Isolates layout/paint to this element
} as const;

export const GPU_ACCELERATED_CONTAINER = {
  ...GPU_ACCELERATED_STYLES,
  contain: 'layout style paint',
} as const;

export const GPU_STABLE_CLASS = 'gpu-stable';

export const INTERSECTION_OBSERVER_CONFIG = {
  once: true,
  margin: '100px 0px',
  amount: 0.1,
} as const;

export const VIEWPORT_ONCE = { once: true } as const;

export const VIEWPORT_PRELOAD = {
  once: true,
  margin: '200px 0px 0px 0px',
  amount: 0.05,
} as const;

// Snappy tween animations - fast enough to feel responsive
export const SMOOTH_TWEEN = {
  type: 'tween' as const,
  duration: 0.3,  // Snappy for responsive feel
  ease: [0.25, 0.1, 0.25, 1.0],
} as const;

export const FAST_TWEEN = {
  type: 'tween' as const,
  duration: 0.2,  // Very fast for UI feedback
  ease: [0.25, 0.1, 0.25, 1.0],
} as const;

// Optimized spring for mobile - higher stiffness = fewer solver iterations
export const LIGHT_SPRING_CONFIG = {
  stiffness: 200,
  damping: 40,
  mass: 0.5,
} as const;

export const GPU_MOTION_PROPS = {
  style: GPU_ACCELERATED_STYLES,
} as const;

// Faster transitions for responsive animations
export const optimizedTransition = (delay: number = 0) => ({
  duration: 0.35,
  delay,
  ease: [0.25, 0.1, 0.25, 1.0],
});

export const fastTransition = (delay: number = 0) => ({
  duration: 0.25,
  delay,
  ease: [0.25, 0.1, 0.25, 1.0],
});

export const fadeInUp = {
  initial: { opacity: 0, y: 30 }, // Increased y for more noticeable motion
  whileInView: { opacity: 1, y: 0 },
  viewport: VIEWPORT_ONCE,
  transition: optimizedTransition(),
};

export const fadeIn = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: VIEWPORT_ONCE,
  transition: optimizedTransition(),
};

export const shouldReduceMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Mobile-optimized animation configuration
 * - Reduces animation complexity on mobile devices (< 768px)
 * - Disables 3D transforms for better performance
 * - Simplifies gradient orb animations
 * - Reduces parallax intensity
 * - Respects prefers-reduced-motion media query
 * 
 * Requirements: 5.4, 6.4
 */
export const getMobileOptimizedAnimation = (isMobile: boolean, prefersReducedMotion: boolean) => {
  if (prefersReducedMotion) {
    // Minimal animations for accessibility
    return {
      duration: 0,
      initial: {},
      animate: {},
      transition: { duration: 0 },
      disable3D: true,
      disableParallax: true,
      disableOrbs: false, // Keep static orbs for visual design
    };
  }

  if (isMobile) {
    // Simplified animations for mobile performance
    return {
      duration: 0.5, // Reduced from 800ms to 500ms
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] },
      disable3D: true, // No 3D transforms on mobile
      disableParallax: true, // Reduced parallax intensity
      disableOrbs: false, // Simplify but keep visible
    };
  }

  // Full animations for desktop
  return {
    duration: 0.8,
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
    disable3D: false,
    disableParallax: false,
    disableOrbs: false,
  };
};

/**
 * Optimized spring configuration for mobile devices
 * Higher stiffness and damping reduce solver iterations
 * 
 * Requirements: 5.4
 */
export const getMobileSpringConfig = (isMobile: boolean) => {
  if (isMobile) {
    return {
      type: 'tween' as const, // Use tween instead of spring on mobile
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0],
    };
  }

  return {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1,
  };
};

/**
 * Get optimized animation properties based on device and user preferences
 * 
 * Requirements: 5.4, 6.4
 */
export const getOptimizedAnimationProps = (isMobile: boolean) => {
  const prefersReducedMotion = shouldReduceMotion();
  
  if (prefersReducedMotion) {
    return {
      initial: {},
      animate: {},
      transition: { duration: 0 },
    };
  }

  if (isMobile) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] },
    };
  }

  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  };
};
