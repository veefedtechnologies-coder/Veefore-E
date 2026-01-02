export const GPU_ACCELERATED_STYLES = {
  transform: 'translate3d(0, 0, 0)',
  backfaceVisibility: 'hidden' as const,
  WebkitBackfaceVisibility: 'hidden' as const,
  perspective: '1000px',
  WebkitFontSmoothing: 'subpixel-antialiased' as const,
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

// Use tweens instead of springs on mobile for performance
export const SMOOTH_TWEEN = {
  type: 'tween' as const,
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1],
} as const;

export const FAST_TWEEN = {
  type: 'tween' as const,
  duration: 0.15,
  ease: [0.22, 1, 0.36, 1],
} as const;

// Light spring for desktop only - minimal solver overhead
export const LIGHT_SPRING_CONFIG = {
  stiffness: 100,
  damping: 20,
  mass: 1,
} as const;

export const GPU_MOTION_PROPS = {
  style: GPU_ACCELERATED_STYLES,
} as const;

export const optimizedTransition = (delay: number = 0) => ({
  duration: 0.35,
  delay,
  ease: [0.22, 1, 0.36, 1], // Snappy ease-out
});

export const fastTransition = (delay: number = 0) => ({
  duration: 0.25,
  delay,
  ease: [0.22, 1, 0.36, 1],
});

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
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
