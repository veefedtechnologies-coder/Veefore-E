import { useEffect, useRef, useState } from 'react'

import { pageLoadTimeline, type PageLoadElement } from './pageLoadTimeline'

/**
 * The observable state of the choreographed page-load entrance sequence.
 *
 * Consumers read `isVisible(element)` to decide whether a given choreographed
 * element should be shown in its revealed (final) state. The hook owns the
 * timing; consumers drive their own framer-motion/CSS reveals from the boolean.
 */
export interface PageLoadState {
  /**
   * `true` once the sequence has begun running (mount, motion enabled). Under
   * reduced motion this is `false` because no timed sequence is run — every
   * element is already in its final state.
   */
  started: boolean
  /**
   * Whether the given element's scheduled start time has elapsed (motion
   * enabled) or whether it should be shown immediately (reduced motion).
   */
  isVisible: (element: PageLoadElement) => boolean
}

/** Options for {@link usePageLoadSequence}. */
export interface UsePageLoadSequenceOptions {
  /**
   * When `true`, the hook runs no timers and reports every element visible
   * immediately (the final state), satisfying the reduced-motion contract.
   */
  reducedMotion?: boolean
}

/**
 * Orchestrates the 2.4s page-load entrance timeline (Requirement 19.1).
 *
 * Built on the pure {@link pageLoadTimeline} descriptor, this hook schedules
 * each choreographed element to become "visible" at its `start` time (seconds
 * relative to mount). It tracks the set of revealed elements in state, so
 * `isVisible(element)` flips from `false` to `true` once that element's start
 * time has elapsed. The reveal order therefore follows the descriptor's
 * non-decreasing start times exactly (Property 15).
 *
 * Reduced motion (Requirements 19.2, 21.1): when `reducedMotion` is `true`, the
 * hook does **not** run any timers and `isVisible` returns `true` for every
 * element, so the page mounts in its final visible state with no entrance
 * animation in any form.
 *
 * The hook is framework-light: it carries no GSAP/framer-motion dependency and
 * simply exposes visibility flags that consumers use to drive their own
 * reveals. All scheduled timers are cleared on unmount.
 *
 * @param opts - Optional configuration; see {@link UsePageLoadSequenceOptions}.
 * @returns The current {@link PageLoadState}.
 */
export function usePageLoadSequence(
  opts?: UsePageLoadSequenceOptions
): PageLoadState {
  const reducedMotion = opts?.reducedMotion ?? false

  // The set of elements whose start time has elapsed. Under reduced motion the
  // effect never runs, so this initial empty set is never consulted (isVisible
  // short-circuits to true below).
  const [revealed, setRevealed] = useState<Set<PageLoadElement>>(
    () => new Set<PageLoadElement>()
  )
  const [started, setStarted] = useState(false)

  useEffect(() => {
    // Reduced motion: do not run the timed sequence at all (Req 19.2/21.1).
    if (reducedMotion) {
      return
    }

    setStarted(true)

    const timeline = pageLoadTimeline()
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const { element, start } of timeline) {
      const delayMs = Math.max(0, start * 1000)
      const timer = setTimeout(() => {
        setRevealed((prev) => {
          if (prev.has(element)) {
            return prev
          }
          const next = new Set(prev)
          next.add(element)
          return next
        })
      }, delayMs)
      timers.push(timer)
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
    }
  }, [reducedMotion])

  // Keep a stable reference to the latest revealed set for the isVisible closure
  // without forcing consumers to depend on identity churn.
  const revealedRef = useRef(revealed)
  revealedRef.current = revealed

  const isVisible = (element: PageLoadElement): boolean => {
    // Reduced motion shows everything immediately in its final state.
    if (reducedMotion) {
      return true
    }
    return revealedRef.current.has(element)
  }

  return { started, isVisible }
}
