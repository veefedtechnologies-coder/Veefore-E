import { useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion'
import { useRef, RefObject } from 'react'

/**
 * Configuration options for parallax effect calculations
 */
export interface ParallaxConfig {
  /**
   * Speed multiplier for parallax movement
   * Values > 1 create faster movement (foreground effect)
   * Values < 1 create slower movement (background effect)
   * @default 0.5
   */
  speed?: number
  
  /**
   * Enable parallax effects on mobile devices
   * @default false (disabled for performance)
   */
  enableOnMobile?: boolean
  
  /**
   * Scroll range in pixels that triggers the parallax effect
   * @default [0, 1000]
   */
  scrollRange?: [number, number]
  
  /**
   * Output transform range for vertical movement
   * @default [-100, 100]
   */
  yRange?: [number, number]
  
  /**
   * Enable opacity fade during parallax
   * @default false
   */
  fadeEnabled?: boolean
  
  /**
   * Opacity range when fade is enabled
   * @default [1, 0]
   */
  opacityRange?: [number, number]
  
  /**
   * Enable scale transformation during parallax
   * @default false
   */
  scaleEnabled?: boolean
  
  /**
   * Scale range when scaling is enabled
   * @default [1, 0.9]
   */
  scaleRange?: [number, number]
}

/**
 * Return type for the useParallaxEffect hook
 */
export interface ParallaxValues {
  /**
   * Current scroll Y position
   */
  scrollY: MotionValue<number>
  
  /**
   * Parallax Y transform value
   */
  y: MotionValue<number>
  
  /**
   * Opacity value (when fade is enabled)
   */
  opacity: MotionValue<number>
  
  /**
   * Scale value (when scaling is enabled)
   */
  scale: MotionValue<number>
  
  /**
   * Ref to attach to the element being parallaxed
   */
  ref: RefObject<HTMLElement>
}

/**
 * Custom hook for advanced parallax effects based on scroll position
 * 
 * Provides smooth parallax transformations using Framer Motion's useTransform.
 * Optimized for performance on both desktop and mobile devices.
 * 
 * @example
 * ```tsx
 * const HeroImage = () => {
 *   const parallax = useParallaxEffect({ speed: 0.5 })
 *   
 *   return (
 *     <motion.div
 *       ref={parallax.ref}
 *       style={{ y: parallax.y, opacity: parallax.opacity }}
 *     >
 *       <img src="/hero.jpg" alt="Hero" />
 *     </motion.div>
 *   )
 * }
 * ```
 * 
 * @example
 * ```tsx
 * // Create a layered parallax effect with different speeds
 * const Background = () => {
 *   const slow = useParallaxEffect({ speed: 0.3 })
 *   const medium = useParallaxEffect({ speed: 0.5 })
 *   const fast = useParallaxEffect({ speed: 0.8 })
 *   
 *   return (
 *     <>
 *       <motion.div ref={slow.ref} style={{ y: slow.y }} className="layer-back" />
 *       <motion.div ref={medium.ref} style={{ y: medium.y }} className="layer-mid" />
 *       <motion.div ref={fast.ref} style={{ y: fast.y }} className="layer-front" />
 *     </>
 *   )
 * }
 * ```
 * 
 * Requirements: 21.2
 */
export const useParallaxEffect = (config: ParallaxConfig = {}): ParallaxValues => {
  const {
    speed = 0.5,
    enableOnMobile = false,
    scrollRange = [0, 1000],
    yRange = [-100, 100],
    fadeEnabled = false,
    opacityRange = [1, 0],
    scaleEnabled = false,
    scaleRange = [1, 0.9]
  } = config
  
  const ref = useRef<HTMLElement>(null)
  const prefersReducedMotion = useReducedMotion()
  
  // Check if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  
  // Get scroll position
  const { scrollY } = useScroll()
  
  // Disable animations if user prefers reduced motion
  if (prefersReducedMotion) {
    return {
      scrollY,
      y: useTransform(() => 0),
      opacity: useTransform(() => 1),
      scale: useTransform(() => 1),
      ref
    }
  }
  
  // Calculate parallax movement based on speed
  // Speed < 1 = slower than scroll (background effect)
  // Speed > 1 = faster than scroll (foreground effect)
  const effectiveYRange: [number, number] = isMobile && !enableOnMobile
    ? [0, 0] // No movement on mobile unless explicitly enabled
    : [yRange[0] * speed, yRange[1] * speed]
  
  // Transform scroll position to Y movement
  const y = useTransform(
    scrollY,
    scrollRange,
    effectiveYRange
  )
  
  // Transform scroll to opacity (when fade is enabled)
  const opacity = useTransform(
    scrollY,
    scrollRange,
    fadeEnabled && (!isMobile || enableOnMobile) ? opacityRange : [1, 1]
  )
  
  // Transform scroll to scale (when scaling is enabled)
  const scale = useTransform(
    scrollY,
    scrollRange,
    scaleEnabled && (!isMobile || enableOnMobile) ? scaleRange : [1, 1]
  )
  
  return {
    scrollY,
    y,
    opacity,
    scale,
    ref
  }
}

/**
 * Preset configurations for common parallax effects
 */
export const ParallaxPresets = {
  /**
   * Slow background layer (moves slower than scroll)
   */
  background: {
    speed: 0.3,
    scrollRange: [0, 1500] as [number, number],
    yRange: [-50, 50] as [number, number]
  },
  
  /**
   * Medium-speed middle layer
   */
  midground: {
    speed: 0.5,
    scrollRange: [0, 1200] as [number, number],
    yRange: [-80, 80] as [number, number]
  },
  
  /**
   * Fast foreground layer (moves faster than scroll)
   */
  foreground: {
    speed: 0.8,
    scrollRange: [0, 1000] as [number, number],
    yRange: [-120, 120] as [number, number]
  },
  
  /**
   * Hero section parallax with fade effect
   */
  hero: {
    speed: 0.6,
    scrollRange: [0, 800] as [number, number],
    yRange: [-60, 60] as [number, number],
    fadeEnabled: true,
    opacityRange: [1, 0] as [number, number]
  },
  
  /**
   * Floating element effect with scale
   */
  floating: {
    speed: 0.4,
    scrollRange: [0, 1000] as [number, number],
    yRange: [-40, 40] as [number, number],
    scaleEnabled: true,
    scaleRange: [1, 0.95] as [number, number]
  },
  
  /**
   * Subtle card parallax effect
   */
  card: {
    speed: 0.2,
    scrollRange: [0, 800] as [number, number],
    yRange: [-30, 30] as [number, number]
  }
} as const

/**
 * Hook for element-specific parallax based on element position in viewport
 * 
 * This variant calculates parallax relative to the element's position
 * rather than absolute scroll position, creating effects that trigger
 * when the element enters the viewport.
 * 
 * @example
 * ```tsx
 * const Card = () => {
 *   const parallax = useElementParallax({ speed: 0.3 })
 *   
 *   return (
 *     <motion.div
 *       ref={parallax.ref}
 *       style={{ y: parallax.y }}
 *     >
 *       Card content
 *     </motion.div>
 *   )
 * }
 * ```
 * 
 * Requirements: 21.2
 */
export const useElementParallax = (config: ParallaxConfig = {}): ParallaxValues => {
  const {
    speed = 0.5,
    enableOnMobile = false,
    yRange = [-50, 50],
    fadeEnabled = false,
    opacityRange = [1, 1],
    scaleEnabled = false,
    scaleRange = [1, 1]
  } = config
  
  const ref = useRef<HTMLElement>(null)
  const prefersReducedMotion = useReducedMotion()
  
  // Check if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  
  // Get scroll position relative to the element
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'] // Track from when element enters to when it leaves
  })
  
  // Disable animations if user prefers reduced motion
  if (prefersReducedMotion) {
    const { scrollY } = useScroll()
    return {
      scrollY,
      y: useTransform(() => 0),
      opacity: useTransform(() => 1),
      scale: useTransform(() => 1),
      ref
    }
  }
  
  // Calculate effective ranges based on mobile status
  const effectiveYRange: [number, number] = isMobile && !enableOnMobile
    ? [0, 0]
    : [yRange[0] * speed, yRange[1] * speed]
  
  // Transform scroll progress to Y movement
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    effectiveYRange
  )
  
  // Transform scroll progress to opacity
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    fadeEnabled && (!isMobile || enableOnMobile)
      ? [opacityRange[0], 1, opacityRange[1]]
      : [1, 1, 1]
  )
  
  // Transform scroll progress to scale
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    scaleEnabled && (!isMobile || enableOnMobile)
      ? [scaleRange[0], 1, scaleRange[1]]
      : [1, 1, 1]
  )
  
  // Create a dummy scrollY for consistency with main hook interface
  const { scrollY } = useScroll()
  
  return {
    scrollY,
    y,
    opacity,
    scale,
    ref
  }
}
