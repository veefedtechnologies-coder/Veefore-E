import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register the ScrollTrigger plugin exactly once at module load — browser only
// (it touches the DOM and breaks SSR import). It's only used inside effects.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

/**
 * Options for {@link useLenis}.
 */
interface UseLenisOptions {
  /**
   * When `true` (the user prefers reduced motion), smooth-scroll inertia is
   * disabled and the page falls back to native scrolling. The Lenis instance
   * is not initialised in this case.
   *
   * @default false
   */
  reducedMotion?: boolean
}

/**
 * Drives Lenis smooth scrolling for the New Landing Page and — crucially —
 * keeps it in lockstep with GSAP ScrollTrigger so the scroll-path draw and any
 * pinned/scrubbed timelines do not fight the smooth scroll.
 *
 * How the sync works:
 *  - Lenis is driven by GSAP's own ticker (one rAF loop, not two competing
 *    ones), with `gsap.ticker.lagSmoothing(0)` for frame-accurate scrubbing.
 *  - On every Lenis `scroll` event we call `ScrollTrigger.update()` so triggers
 *    read Lenis's virtual scroll position rather than the native one.
 *
 * Under reduced motion the hook skips Lenis entirely (native scrolling).
 *
 * SSR-safe; full teardown on unmount (Requirements 18.3, 18.4, 18.6, 23.2).
 */
export function useLenis(options?: UseLenisOptions): void {
  const reducedMotion = options?.reducedMotion ?? false

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (reducedMotion) return

    let lenis: Lenis | null = null

    try {
      lenis = new Lenis({
        duration: 1.1,
        // A gentle, premium ease-out for the wheel/inertia feel.
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      })
    } catch (error) {
      console.warn('[useLenis] failed to initialise Lenis; using native scroll', error)
      return
    }

    // Keep ScrollTrigger in sync with Lenis's virtual scroll position.
    const onScroll = () => ScrollTrigger.update()
    lenis.on('scroll', onScroll)

    // Drive Lenis from GSAP's ticker — a single source of truth for frames.
    const tick = (time: number) => {
      // GSAP ticker time is in seconds; Lenis expects milliseconds.
      lenis?.raf(time * 1000)
    }
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      try {
        gsap.ticker.remove(tick)
        lenis?.off('scroll', onScroll)
        lenis?.destroy()
      } catch (error) {
        console.warn('[useLenis] smooth-scroll cleanup did not complete', error)
      }
    }
  }, [reducedMotion])
}
