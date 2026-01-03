export const GPU_ACCELERATED_STYLES = {
  transform: 'translate3d(0, 0, 0)',
  backfaceVisibility: 'hidden' as const,
  WebkitBackfaceVisibility: 'hidden' as const,
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
