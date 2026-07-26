import { useMediaQuery } from './useMediaQuery'

/**
 * Subscribes to the browser's `prefers-reduced-motion: reduce` preference.
 *
 * Returns `true` when the user has requested reduced motion, in which case the
 * landing page suppresses entrance, continuous, and interaction animations.
 * Backed by {@link useMediaQuery}, so it is SSR-safe and updates reactively if
 * the preference changes at runtime.
 *
 * Requirements: 21.1, 23.2
 *
 * @returns `true` when reduced motion is preferred, otherwise `false`.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
