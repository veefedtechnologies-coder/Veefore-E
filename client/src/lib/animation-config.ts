/**
 * Animation Configuration - Landing Page Sections Redesign
 * 
 * Framer Motion animation variants and configuration matching the hero section.
 * Includes easing curves, spring physics, and reusable animation patterns.
 */

import { Variants, Transition } from 'framer-motion';

// ============================================================================
// EASING CURVES
// ============================================================================

/**
 * Custom easing curve matching hero section
 * Cubic bezier: [0.22, 1, 0.36, 1]
 */
export const easings = {
  hero: [0.22, 1, 0.36, 1] as const,
  standard: [0.25, 0.1, 0.25, 1.0] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeIn: [0.7, 0, 0.84, 0] as const,
} as const;

// ============================================================================
// SPRING CONFIGURATIONS
// ============================================================================

/**
 * Spring physics configurations for smooth, natural motion
 */
export const springs = {
  // Default spring for cursor animations and smooth transitions
  default: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1,
  },

  // Gentle spring for card returns to neutral position
  gentle: {
    type: 'spring' as const,
    stiffness: 150,
    damping: 30,
    mass: 1,
  },

  // Snappy spring for magnetic effects
  snappy: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 20,
    mass: 0.8,
  },

  // Bouncy spring for playful interactions
  bouncy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 15,
    mass: 0.5,
  },
} as const;

// ============================================================================
// DURATION PRESETS
// ============================================================================

/**
 * Standard duration values in seconds
 */
export const durations = {
  instant: 0.15,
  fast: 0.3,
  normal: 0.5,
  slow: 0.8,
  verySlow: 1.2,
} as const;

// ============================================================================
// FRAMER MOTION VARIANTS
// ============================================================================

/**
 * Fade in from bottom with hero section easing
 */
export const fadeInUp: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: easings.hero,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.5,
      ease: easings.easeIn,
    },
  },
};

/**
 * Fade in from bottom with longer delay
 */
export const fadeInUpSlow: Variants = {
  initial: {
    opacity: 0,
    y: 30,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.2,
      ease: easings.hero,
    },
  },
};

/**
 * Simple fade in/out
 */
export const fadeIn: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: easings.hero,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
    },
  },
};

/**
 * Stagger children animations with delays
 * Use with staggerChildren to create sequential animations
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

/**
 * Stagger with faster timing
 */
export const staggerContainerFast: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

/**
 * Scale on hover (for interactive elements)
 */
export const scaleOnHover: Variants = {
  initial: {
    scale: 1,
  },
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.3,
      ease: easings.easeOut,
    },
  },
  tap: {
    scale: 0.95,
  },
};

/**
 * Scale with spring physics
 */
export const scaleSpring: Variants = {
  initial: {
    scale: 1,
  },
  hover: {
    scale: 1.05,
    transition: springs.default,
  },
  tap: {
    scale: 0.95,
    transition: springs.snappy,
  },
};

/**
 * Shimmer effect for borders and highlights
 */
export const shimmer: Variants = {
  initial: {
    x: '-100%',
  },
  animate: {
    x: '100%',
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Breathing animation (subtle scale pulse)
 */
export const breathing: Variants = {
  initial: {
    scale: 1,
  },
  animate: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Pulsing glow effect
 */
export const pulseGlow: Variants = {
  initial: {
    opacity: 0.5,
  },
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Rotation animation for orbit rings
 */
export const rotate: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 30,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Reverse rotation for orbit rings
 */
export const rotateReverse: Variants = {
  animate: {
    rotate: -360,
    transition: {
      duration: 40,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Page transition crossfade
 */
export const crossfade: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: easings.hero,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: easings.hero,
    },
  },
};

/**
 * Click ripple effect
 */
export const clickRipple: Variants = {
  initial: {
    scale: 0.8,
    opacity: 0.8,
  },
  animate: {
    scale: 1.8,
    opacity: 0,
    transition: {
      duration: 0.4,
      ease: easings.easeOut,
    },
  },
};

/**
 * Gradient orb floating animation
 */
export const floatingOrb: Variants = {
  animate: {
    y: [0, -20, 0],
    x: [0, 10, 0],
    transition: {
      duration: 8,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================================================
// TRANSITION PRESETS
// ============================================================================

/**
 * Standard transition with hero easing
 */
export const heroTransition: Transition = {
  duration: 0.8,
  ease: easings.hero,
};

/**
 * Fast transition
 */
export const fastTransition: Transition = {
  duration: 0.3,
  ease: easings.standard,
};

/**
 * Slow transition
 */
export const slowTransition: Transition = {
  duration: 1.2,
  ease: easings.hero,
};

// ============================================================================
// HOVER INTERACTIONS
// ============================================================================

/**
 * 3D tilt effect configuration
 */
export const tiltConfig = {
  maxTilt: 8, // Maximum tilt in degrees
  perspective: 1000, // CSS perspective value
  scale: 1.02, // Slight scale on hover
  transition: springs.gentle,
};

/**
 * Magnetic effect configuration
 */
export const magneticConfig = {
  strength: 0.15, // Multiplier for offset calculation
  transition: springs.snappy,
};

// ============================================================================
// ANIMATION TIMING
// ============================================================================

/**
 * Dashboard-specific timing
 */
export const dashboardTiming = {
  pageDisplayDuration: 2000, // 2s per page
  cursorMoveDuration: 300, // 300ms for cursor transition
  clickAnimationDuration: 200, // 200ms for click effect
  totalCycleDuration: 8200, // 8.2s for complete cycle
  transitionDelay: 300, // 300ms between page transitions
};

/**
 * Feature card timing
 */
export const featureCardTiming = {
  staggerDelay: 150, // 150ms between cards
  hoverDuration: 300, // 300ms for hover transitions
  tiltReturnDuration: 400, // 400ms to return to neutral
  gradientFadeDuration: 500, // 500ms for gradient overlay
};

// ============================================================================
// GPU ACCELERATION UTILITIES
// ============================================================================

/**
 * CSS properties for GPU acceleration
 */
export const gpuAcceleration = {
  transform: 'translateZ(0)',
  willChange: 'transform, opacity',
  backfaceVisibility: 'hidden' as const,
};

/**
 * Mobile-optimized (2D transforms only)
 */
export const mobileOptimized = {
  transform: 'translate3d(0, 0, 0)',
  willChange: 'auto',
};

// ============================================================================
// REDUCED MOTION SUPPORT
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get transition with reduced motion support
 */
export const getTransition = (transition: Transition): Transition => {
  if (prefersReducedMotion()) {
    return {
      duration: 0.01, // Nearly instant
      ease: 'linear',
    };
  }
  return transition;
};

/**
 * Get variants with reduced motion support
 */
export const getVariants = (variants: Variants): Variants => {
  if (prefersReducedMotion()) {
    // Return simplified variants without complex animations
    return {
      initial: variants.initial,
      animate: {
        ...variants.initial,
        opacity: 1, // Preserve opacity changes
      },
    };
  }
  return variants;
};

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SpringType = keyof typeof springs;
export type EasingType = keyof typeof easings;
export type DurationType = keyof typeof durations;
