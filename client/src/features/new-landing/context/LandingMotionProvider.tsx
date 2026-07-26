import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

import { useMediaQuery } from '../hooks/useMediaQuery'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * Resolved motion-gating flags shared across the landing page.
 *
 * Every animated effect reads these flags rather than querying the environment
 * independently, guaranteeing consistent suppression and a single place to
 * reason about motion.
 *
 * - `reducedMotion` — user prefers reduced motion (`prefers-reduced-motion: reduce`).
 * - `isMobile` — viewport is at or below the mobile breakpoint (`<= 768px`).
 * - `finePointer` — the primary pointer is fine/precise (`(pointer: fine)`).
 */
export interface LandingMotion {
  reducedMotion: boolean
  isMobile: boolean
  finePointer: boolean
}

const LandingMotionContext = createContext<LandingMotion | null>(null)

/**
 * Provides the landing page's motion-gating flags via React context.
 *
 * Resolves the three booleans from the underlying media-query hooks and exposes
 * them to every descendant, so animated components share one consistent source
 * of truth for motion suppression.
 *
 * Requirements: 18.4, 18.5, 21.1
 */
export const LandingMotionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const reducedMotion = useReducedMotion()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const finePointer = useMediaQuery('(pointer: fine)')

  const value = useMemo<LandingMotion>(
    () => ({ reducedMotion, isMobile, finePointer }),
    [reducedMotion, isMobile, finePointer],
  )

  return <LandingMotionContext.Provider value={value}>{children}</LandingMotionContext.Provider>
}

/**
 * Reads the landing page's motion-gating flags from context.
 *
 * @throws If called outside a {@link LandingMotionProvider}.
 * @returns The resolved {@link LandingMotion} flags.
 */
export function useLandingMotion(): LandingMotion {
  const context = useContext(LandingMotionContext)

  if (context === null) {
    throw new Error('useLandingMotion must be used within a LandingMotionProvider')
  }

  return context
}
