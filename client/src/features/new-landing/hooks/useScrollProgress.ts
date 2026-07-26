import { useEffect, useState } from 'react'

/**
 * Tracks overall page scroll progress as a value in `[0, 1]`.
 *
 * Progress is computed as `scrollY / (scrollHeight - innerHeight)` and clamped
 * to `[0, 1]`. When the document is not scrollable (content fits the viewport),
 * progress resolves to `0`.
 *
 * The scroll listener is registered as a passive listener and updates are
 * throttled through `requestAnimationFrame` so at most one recalculation runs
 * per frame. The listener, resize listener, and any pending animation frame are
 * cleaned up on unmount.
 *
 * SSR-safe: returns `0` until mounted in a browser environment.
 *
 * Requirements: 22.5, 23.2
 *
 * @returns The current page scroll progress in the range `[0, 1]`.
 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    let frameId: number | null = null

    const compute = (): number => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      if (scrollable <= 0) {
        return 0
      }
      const raw = window.scrollY / scrollable
      return Math.min(1, Math.max(0, raw))
    }

    const update = () => {
      frameId = null
      setProgress(compute())
    }

    const handleScroll = () => {
      // rAF throttle: coalesce bursts of scroll events into one update per frame.
      if (frameId === null) {
        frameId = window.requestAnimationFrame(update)
      }
    }

    // Sync the initial value after mount.
    setProgress(compute())

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [])

  return progress
}
