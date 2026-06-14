import { useRef, useEffect, useState } from 'react'
import { useScroll, useTransform, useSpring, type MotionValue, useReducedMotion } from 'framer-motion'

/**
 * Custom hook for scroll-based animations on the landing page
 * 
 * Provides parallax, fade, and transform effects that respond to scroll position
 * with optimized performance for mobile devices and accessibility support
 * 
 * Features:
 * - Scroll-triggered animations with customizable ranges
 * - Parallax effects (opacity, scale, position)
 * - Transform animations (translate, rotate)
 * - Spring-based smooth animations
 * - Mobile optimization (reduced animations)
 * - Accessibility support (respects prefers-reduced-motion)
 * - IntersectionObserver integration for viewport-based triggers
 * 
 * Requirements: 21.2, 22.5
 */

/**
 * Configuration options for scroll animations
 */
export interface ScrollAnimationConfig {
  /** Scroll range for animations [start, end] in pixels */
  range?: [number, number]
  /** Enable spring physics for smoother animations */
  useSpring?: boolean
  /** Spring configuration */
  springConfig?: {
    stiffness: number
    damping: number
    mass: number
  }
  /** Disable animations on mobile devices */
  disableOnMobile?: boolean
  /** Custom viewport threshold for intersection observer */
  viewportThreshold?: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<ScrollAnimationConfig> = {
  range: [0, 800],
  useSpring: true,
  springConfig: {
    stiffness: 100,
    damping: 30,
    mass: 1
  },
  disableOnMobile: false,
  viewportThreshold: 0.1
}

/**
 * Main scroll animation hook
 * 
 * @param config - Optional configuration object
 * @returns Object containing animation values and utilities
 */
export const useScrollAnimation = (config: ScrollAnimationConfig = {}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const { range, useSpring: enableSpring, springConfig, disableOnMobile } = mergedConfig
  
  const { scrollY } = useScroll()
  const prefersReducedMotion = useReducedMotion()
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Should animations be disabled?
  const shouldDisableAnimations = prefersReducedMotion || (disableOnMobile && isMobile)

  // Base scroll transforms
  const baseOpacity = useTransform(scrollY, range, [1, 0])
  const baseScale = useTransform(scrollY, range, [1, 0.92])
  const baseY = useTransform(scrollY, range, [0, -100])
  
  // Progressive blur filter (Desktop only)
  const blurValue = useTransform(scrollY, range, [0, 24])
  const filter = useTransform(blurValue, (v) => {
    if (isMobile || shouldDisableAnimations) return 'blur(0px)'
    return `blur(${v}px)`
  })
  
  // Mobile-optimized dark overlay fallback (no blur on mobile for performance)
  const mobileDarkenOpacity = useTransform(scrollY, range, [0, 0.95])
  const overlayOpacity = useTransform(mobileDarkenOpacity, (v) => {
    if (!isMobile) return 0
    return v
  })

  // Apply spring physics if enabled
  const opacity = enableSpring && !shouldDisableAnimations
    ? useSpring(baseOpacity, springConfig)
    : baseOpacity
    
  const scale = enableSpring && !shouldDisableAnimations
    ? useSpring(baseScale, springConfig)
    : baseScale
    
  const translateY = enableSpring && !shouldDisableAnimations
    ? useSpring(baseY, springConfig)
    : baseY

  // If animations disabled, return static values
  if (shouldDisableAnimations) {
    return {
      scrollY,
      opacity: 1,
      scale: 1,
      translateY: 0,
      filter: 'blur(0px)',
      overlayOpacity: 0,
      isAnimationEnabled: false,
      isMobile
    }
  }

  return {
    scrollY,
    opacity,
    scale,
    translateY,
    filter,
    overlayOpacity,
    isAnimationEnabled: true,
    isMobile
  }
}

/**
 * Hook for creating parallax scroll effects with custom ranges
 * 
 * @param scrollRange - Scroll range [start, end]
 * @param outputRange - Output value range [start, end]
 * @returns MotionValue for the parallax effect
 */
export const useParallaxScroll = (
  scrollRange: [number, number],
  outputRange: [number, number]
): MotionValue<number> => {
  const { scrollY } = useScroll()
  return useTransform(scrollY, scrollRange, outputRange)
}

/**
 * Hook for viewport-based animation triggers using IntersectionObserver
 * 
 * @param threshold - Visibility threshold (0-1)
 * @returns Object with ref and visibility state
 */
export const useScrollTrigger = (threshold = 0.1) => {
  const ref = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        setIsVisible(visible)
        if (visible && !hasTriggered) {
          setHasTriggered(true)
        }
      },
      { threshold }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, hasTriggered])

  return { ref, isVisible, hasTriggered }
}

/**
 * Hook for creating stagger animations on scroll
 * 
 * @param itemCount - Number of items to stagger
 * @param delayIncrement - Delay between each item in seconds
 * @returns Array of delay values
 */
export const useStaggerAnimation = (itemCount: number, delayIncrement = 0.1) => {
  return Array.from({ length: itemCount }, (_, i) => i * delayIncrement)
}

/**
 * Advanced parallax hook with multiple effects
 * 
 * @param config - Configuration for parallax effects
 * @returns Object containing multiple parallax motion values
 */
export interface ParallaxConfig {
  /** Enable opacity fade effect */
  opacity?: boolean
  /** Enable scale effect */
  scale?: boolean
  /** Enable rotation effect */
  rotate?: boolean
  /** Enable translateY effect */
  translateY?: boolean
  /** Enable translateX effect */
  translateX?: boolean
  /** Scroll range [start, end] */
  range?: [number, number]
}

export const useAdvancedParallax = (config: ParallaxConfig = {}) => {
  const {
    opacity: enableOpacity = true,
    scale: enableScale = false,
    rotate: enableRotate = false,
    translateY: enableTranslateY = true,
    translateX: enableTranslateX = false,
    range = [0, 1000]
  } = config

  const { scrollY } = useScroll()
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return {
      opacity: 1,
      scale: 1,
      rotate: 0,
      translateY: 0,
      translateX: 0
    }
  }

  const opacity = enableOpacity
    ? useTransform(scrollY, range, [1, 0])
    : 1

  const scale = enableScale
    ? useTransform(scrollY, range, [1, 0.8])
    : 1

  const rotate = enableRotate
    ? useTransform(scrollY, range, [0, 10])
    : 0

  const translateY = enableTranslateY
    ? useTransform(scrollY, range, [0, -200])
    : 0

  const translateX = enableTranslateX
    ? useTransform(scrollY, range, [0, 100])
    : 0

  return {
    opacity,
    scale,
    rotate,
    translateY,
    translateX
  }
}

/**
 * Type definitions for scroll animation values
 */
export interface ScrollAnimationValues {
  scrollY: MotionValue<number>
  opacity: MotionValue<number> | number
  scale: MotionValue<number> | number
  translateY: MotionValue<number> | number
  filter: MotionValue<string> | string
  overlayOpacity: MotionValue<number> | number
  isAnimationEnabled: boolean
  isMobile: boolean
}
