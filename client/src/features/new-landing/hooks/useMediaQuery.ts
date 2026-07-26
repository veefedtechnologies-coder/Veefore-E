import { useEffect, useState } from 'react'

/**
 * Generic `matchMedia` subscription hook.
 *
 * Subscribes to a CSS media query and returns whether it currently matches,
 * updating reactively as the match state changes.
 *
 * SSR-safe: when `window` is unavailable the hook returns `false` for the
 * initial render and resolves the real value after mount.
 *
 * Cross-browser: prefers `addEventListener('change', ...)` and falls back to
 * the deprecated `addListener` for older browsers (e.g. Safari < 14).
 *
 * Used as the single source of truth for the landing page's motion gating
 * model (reduced-motion, mobile breakpoint, pointer capability).
 *
 * Requirements: 21.1, 23.2
 *
 * @param query - A CSS media query string, e.g. `(prefers-reduced-motion: reduce)`.
 * @returns `true` when the query currently matches, otherwise `false`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(query)

    // Sync immediately in case the value changed between render and effect.
    setMatches(mediaQueryList.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }

    // Fallback for older browsers that only support the deprecated API.
    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [query])

  return matches
}
