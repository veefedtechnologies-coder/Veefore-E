import type { Variants, Transition } from 'framer-motion'

/**
 * Animation Variants Library for Landing Page
 * 
 * Centralized repository of reusable Framer Motion animation configurations
 * for consistent animations across landing page components.
 * 
 * Requirements: 22.4
 */

// ============================================================================
// TRANSITION CONFIGURATIONS
// ============================================================================

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
  mass: 1
}

export const fastSpringTransition: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 30,
  mass: 1
}

export const gentleSpringTransition: Transition = {
  type: 'spring',
  stiffness: 70,
  damping: 20,
  mass: 1.2
}

// ============================================================================
// BASE ANIMATION VARIANTS
// ============================================================================

/** Fade In - Element gradually appears from transparent to visible */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.3 } }
}

/** Fade In with Blur - Element appears with blur effect clearing */
export const fadeInBlur: Variants = {
  hidden: { opacity: 0, filter: 'blur(10px)' },
  visible: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, filter: 'blur(10px)', transition: { duration: 0.3 } }
}

/** Slide Up - Element slides up from below while fading in */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: springTransition },
  exit: { opacity: 0, y: -40, transition: { duration: 0.3 } }
}

/** Slide Down - Element slides down from above while fading in */
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -40 },
  visible: { opacity: 1, y: 0, transition: springTransition },
  exit: { opacity: 0, y: 40, transition: { duration: 0.3 } }
}

/** Slide Left - Element slides in from the right */
export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: springTransition },
  exit: { opacity: 0, x: -60, transition: { duration: 0.3 } }
}

/** Slide Right - Element slides in from the left */
export const slideRight: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: springTransition },
  exit: { opacity: 0, x: 60, transition: { duration: 0.3 } }
}

/** Scale In - Element scales up from small to normal size */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: springTransition },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.3 } }
}

/** Scale In with Pop - Element scales up with a bounce effect */
export const scaleInPop: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } },
  exit: { opacity: 0, scale: 0.5, transition: { duration: 0.3 } }
}

// ============================================================================
// CARD ANIMATION VARIANTS
// ============================================================================

/** Feature Card - Cards slide up and fade in with hover interaction */
export const featureCard: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: gentleSpringTransition },
  hover: { y: -8, scale: 1.02, transition: fastSpringTransition },
  tap: { scale: 0.98, transition: { duration: 0.1 } }
}

/** Pricing Card - Pricing cards with prominent hover effect */
export const pricingCard: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springTransition },
  hover: { y: -12, scale: 1.03, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)', transition: fastSpringTransition },
  tap: { scale: 0.97, transition: { duration: 0.1 } }
}

/** Testimonial Card - Cards with gentle floating effect */
export const testimonialCard: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: gentleSpringTransition },
  hover: { y: -6, transition: gentleSpringTransition }
}

// ============================================================================
// SECTION ANIMATION VARIANTS
// ============================================================================

/** Hero Section - Large section with dramatic entrance */
export const heroSection: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.2, delayChildren: 0.1 } 
  }
}

/** Content Section - Standard section with stagger for child elements */
export const contentSection: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.15, delayChildren: 0.2 } 
  }
}

/** Feature Grid - Grid with staggered card animations */
export const featureGrid: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.3 } }
}

/** Pricing Section - Pricing grid with center-out stagger */
export const pricingSection: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2, delayChildren: 0.2 } }
}

// ============================================================================
// CTA ANIMATION VARIANTS
// ============================================================================

/** Primary CTA Button - Prominent call-to-action with attention-grabbing animation */
export const primaryCTA: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 150, damping: 20 } },
  hover: { scale: 1.05, boxShadow: '0 10px 40px rgba(59, 130, 246, 0.4)', transition: { type: 'spring', stiffness: 400, damping: 20 } },
  tap: { scale: 0.95, transition: { duration: 0.1 } }
}

/** Secondary CTA Button - Subtle call-to-action for secondary actions */
export const secondaryCTA: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springTransition },
  hover: { scale: 1.02, transition: fastSpringTransition },
  tap: { scale: 0.98, transition: { duration: 0.1 } }
}

/** Floating CTA - CTA with continuous floating animation */
export const floatingCTA: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: springTransition },
  hover: { y: -8, transition: gentleSpringTransition },
  float: { y: [-5, 5, -5], transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }
}

// ============================================================================
// PRESET COLLECTIONS
// ============================================================================

/** Card Animation Presets */
export const cardPresets = {
  feature: featureCard,
  pricing: pricingCard,
  testimonial: testimonialCard
} as const

/** Section Animation Presets */
export const sectionPresets = {
  hero: heroSection,
  content: contentSection,
  featureGrid,
  pricing: pricingSection
} as const

/** CTA Animation Presets */
export const ctaPresets = {
  primary: primaryCTA,
  secondary: secondaryCTA,
  floating: floatingCTA
} as const

/** Base Animation Presets */
export const basePresets = {
  fadeIn,
  fadeInBlur,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
  scaleIn,
  scaleInPop
} as const

