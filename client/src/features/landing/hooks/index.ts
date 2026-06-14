/**
 * Landing page hooks index
 * 
 * Exports custom hooks for scroll-based animations and parallax effects
 */

export { useScrollAnimation } from './useScrollAnimation'
export type { ScrollAnimationValues } from './useScrollAnimation'

export { 
  useParallaxEffect, 
  useElementParallax,
  ParallaxPresets 
} from './useParallaxEffect'

export type { 
  ParallaxConfig, 
  ParallaxValues 
} from './useParallaxEffect'
