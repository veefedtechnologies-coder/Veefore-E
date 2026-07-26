import { useEffect, useRef, useState } from 'react'

/**
 * Options controlling the {@link useCountUp} animation.
 */
export interface UseCountUpOptions {
  /** Total animation duration in milliseconds. Default `2000`. */
  duration?: number
  /** Starting value to count up from. Default `0`. */
  start?: number
  /** When `true`, skips the animation and returns `target` immediately. */
  reducedMotion?: boolean
  /** When `true` (default), the count-up runs; when `false`, it stays at `start`. */
  active?: boolean
}

/**
 * `requestAnimationFrame`-based number count-up — a replacement for CountUp.js.
 *
 * Animates from `start` to `target` over `duration` milliseconds using an
 * ease-out curve, returning the current intermediate value each frame. The
 * animation runs only while `active` is `true` (default), which lets callers
 * defer the count-up until the element scrolls into view.
 *
 * When `reducedMotion` is `true`, the hook returns the final `target` value
 * immediately with no animation (Requirement 21.1). The pending animation frame
 * is cancelled on unmount and whenever inputs change so no frame fires after
 * teardown (Requirement 22.5).
 *
 * Requirements: 13.3, 22.5, 23.1, 23.2
 *
 * @param target - The value to count up to.
 * @param opts - Duration, start value, motion and active flags.
 * @returns The current animated value.
 */
export function useCountUp(target: number, opts?: UseCountUpOptions): number {
  const { duration = 2000, start = 0, reducedMotion = false, active = true } = opts ?? {}

  const [value, setValue] = useState<number>(reducedMotion ? target : start)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    // Reduced motion: jump straight to the final value, run no frames.
    if (reducedMotion) {
      setValue(target)
      return
    }

    if (!active) {
      setValue(start)
      return
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      // No rAF available (e.g. SSR): show the final value.
      setValue(target)
      return
    }

    const range = target - start
    let startTime: number | null = null

    const step = (now: number) => {
      if (startTime === null) {
        startTime = now
      }
      const elapsed = now - startTime
      const progress = duration <= 0 ? 1 : Math.min(1, elapsed / duration)
      // Ease-out cubic for a natural deceleration.
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(start + range * eased)

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step)
      } else {
        frameRef.current = null
        setValue(target)
      }
    }

    setValue(start)
    frameRef.current = window.requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [target, duration, start, reducedMotion, active])

  return value
}
