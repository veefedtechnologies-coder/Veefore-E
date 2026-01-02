export const GPU_ACCELERATED_STYLES = {
  willChange: 'transform, opacity',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden' as const,
  WebkitBackfaceVisibility: 'hidden' as const,
} as const;

export const GPU_ACCELERATED_CONTAINER = {
  ...GPU_ACCELERATED_STYLES,
  contain: 'layout style paint',
} as const;

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

export const SMOOTH_SPRING_CONFIG = {
  stiffness: 100,
  damping: 30,
  mass: 0.8,
} as const;

export const FAST_SPRING_CONFIG = {
  stiffness: 150,
  damping: 25,
  mass: 0.5,
} as const;

export const GPU_MOTION_PROPS = {
  style: GPU_ACCELERATED_STYLES,
} as const;

export const optimizedTransition = (delay: number = 0) => ({
  duration: 0.6,
  delay,
  ease: [0.25, 0.46, 0.45, 0.94],
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
